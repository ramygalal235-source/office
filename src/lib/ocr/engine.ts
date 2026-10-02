// ===== محرك الاستخراج: بروتوكول OpenAI-compatible =====
// كل المزودين يتكلمون نفس البروتوكول (chat/completions مع image_url بـ base64)،
// فالفرق بينهم إعدادات فقط: العنوان والنموذج والمفتاح.
//   • Ollama محليًا (افتراضي): مجاني وعامل بدون إنترنت — الأنسب لوثائق العملاء
//   • Z.AI: glm-4v-flash مجاني على منصتهم السحابية
//   • مخصص: أي خادم vLLM / LM Studio / OpenRouter / Groq
import { db } from "@/lib/db";

export type OcrProviderId = "ollama" | "zai" | "custom";

function asProviderId(v: unknown): OcrProviderId {
  return v === "ollama" || v === "zai" || v === "custom" ? v : "ollama";
}

export interface OcrSettings {
  provider: OcrProviderId;
  model: string;
  baseUrl: string;
  apiKey: string;
}

const PRESETS: Record<OcrProviderId, { baseUrl: string; model: string }> = {
  ollama: { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5vl:7b" },
  zai: { baseUrl: "https://api.z.ai/api/paas/v4", model: "glm-4v-flash" },
  custom: { baseUrl: "", model: "" },
};

/**
 * إعدادات الاستخراج من جدول الإعدادات (local-first: تُعدَّل محليًا لاحقًا من شاشة الإعدادات)
 * مع تفوّق متغيرات البيئة عند وجودها: OCR_PROVIDER / OCR_MODEL / OCR_BASE_URL / OCR_API_KEY
 */
export async function getOcrSettings(overrides?: { provider?: string; model?: string }): Promise<OcrSettings> {
  const envProvider = process.env.OCR_PROVIDER as OcrProviderId | undefined;
  const envModel = process.env.OCR_MODEL;
  const envBaseUrl = process.env.OCR_BASE_URL;
  const envApiKey = process.env.OCR_API_KEY ?? process.env.ZAI_API_KEY;

  const settings = await db.setting.findMany({ where: { group: "ocr" } });
  const dbValue = (key: string) => settings.find((s) => s.key === key)?.value ?? "";

  const provider = asProviderId(overrides?.provider ?? envProvider ?? (dbValue("ocr.provider") || undefined));
  const preset = PRESETS[provider] ?? PRESETS.ollama;
  const baseUrl = (provider === "custom" ? envBaseUrl ?? dbValue("ocr.baseUrl") : (envBaseUrl ?? dbValue(`ocr.baseUrl.${provider}`)) || preset.baseUrl) || preset.baseUrl;
  const model = (overrides?.model ?? envModel ?? dbValue("ocr.model")) || preset.model;
  const apiKey = provider === "ollama" ? "" : envApiKey ?? dbValue("ocr.apiKey") ?? "";

  return { provider, model, baseUrl, apiKey };
}

/** هل الخادم يستجيب؟ (اختبار سريع بدون استدعاء نموذج) */
export async function isOcrAvailable(settings: OcrSettings): Promise<boolean> {
  if (settings.provider === "ollama") {
    try {
      const res = await fetch(`${settings.baseUrl}/models`, { signal: AbortSignal.timeout(2000) });
      return res.ok;
    } catch {
      return false;
    }
  }
  if (settings.provider !== "custom" || settings.apiKey) {
    try {
      const res = await fetch(`${settings.baseUrl}/models`, {
        headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {},
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  return false;
}

export interface VisionRequest {
  settings: OcrSettings;
  imageBase64: string;
  mimeType: string;
  prompt: string;
}

/** استدعاء نموذج بصري واحد؛ يعيد نص الإجابة الخام */
export async function visionComplete({ settings, imageBase64, mimeType, prompt }: VisionRequest): Promise<string> {
  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    const hint =
      settings.provider === "ollama"
        ? " (تأكد من عمل Ollama: ollama serve، وأن النموذج موجود: ollama pull)"
        : " (تحقق من عنوان الخادم والمفتاح)";
    const msg = e instanceof Error && e.name === "TimeoutError" ? "انتهت مهلة انتظار نموذج الاستخراج" : "تعذّر الوصول إلى خدمة الاستخراج";
    throw new Error(`${msg}${hint}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const short = body.slice(0, 200);
    if (res.status === 404) throw new Error(`النموذج ${settings.model} غير موجود على ${settings.baseUrl} — جرّب: ollama list`);
    if (res.status === 401) throw new Error("مفتاح الاستخراج غير صالح (401)");
    throw new Error(`خدمة الاستخراج أجابت بالحالة ${res.status}: ${short}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("إجابة النموذج فارغة — ربما النموذج لا يدعم الإدخال البصري");
  }
  return content;
}
