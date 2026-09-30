import { NextRequest } from "next/server";
import { fail, ok, requireAdmin } from "@/lib/accounting/api";
import { getOcrSettings } from "@/lib/ocr/engine";

/**
 * اختبار الاتصال بخدمة الاستخراج (admin)
 * يعيد: حالة الوصول + قائمة النماذج المتاحة على الخادم (إن أمكن)
 */
export async function POST(_req: NextRequest) {
  if (!requireAdmin(_req)) return fail("صلاحية المدير مطلوبة", 403);

  const settings = await getOcrSettings();
  const url = `${settings.baseUrl.replace(/\/$/, "")}/models`;
  const headers: Record<string, string> = {};
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  } catch {
    return ok({
      ok: false,
      models: [],
      message:
        settings.provider === "ollama"
          ? "تعذّر الوصول إلى Ollama على هذا العنوان — تأكد من تشغيله (ollama serve)"
          : "تعذّر الوصول إلى عنوان الخادم — تحقق من العنوان والتحكم في النوافذ الناري (firewall)",
    });
  }

  if (!res.ok) {
    return ok({ ok: false, models: [], message: `خدمة الاستخراج أجابت بالحالة ${res.status}` });
  }

  let models: string[] = [];
  try {
    const json = (await res.json()) as { data?: { id?: string }[] };
    models = (json.data ?? []).map((m) => m.id ?? "").filter(Boolean);
  } catch {
    models = [];
  }

  const hasModel = models.includes(settings.model);
  return ok({
    ok: true,
    models,
    modelKnown: hasModel,
    message: hasModel
      ? `الاتصال ناجح — النموذج ${settings.model} متوفر`
      : `الاتصال ناجح، لكن النموذج ${settings.model} غير موجود. المتاح: ${models.slice(0, 5).join("، ") || "لا شيء"}`,
  });
}
