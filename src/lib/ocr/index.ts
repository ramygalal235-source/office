// ===== إدارة الاستخراج الآلي للوثائق =====
// دورة الوثيقة: UPLOADED → EXTRACTING → REVIEW → (APPROVED | REJECTED)
// الاستخراج يسجَّل كـ Extraction مستقل (تاريخ كامل، قابل لإعادة التشغيل بمزوّد مختلف)،
// ووثيقة واحدة قد تحمل عدة محاولات استخراج دون أن تضيع أي واحدة.
import { db } from "@/lib/db";
import { DOCUMENT_TYPES } from "@/lib/domain";
import { readUpload } from "@/lib/storage";
import { record } from "@/lib/automation/event-log";
import { buildExtractionPrompt, parseOcrResponse, type OcrField } from "./prompt";
import { getOcrSettings, isOcrAvailable, visionComplete, type OcrSettings } from "./engine";

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);

export type { OcrField };
export { getOcrSettings, isOcrAvailable };
export type { OcrSettings, OcrProviderId } from "./engine";

export interface ExtractionRunResult {
  extractionId: string;
  status: "DONE" | "FAILED";
  confidence: number;
  provider: string;
  model: string;
}

/**
 * ينفّذ دورة استخراج واحدة لوثيقة.
 * آمن لإعادة التنفيذ: كل محاولة تضيف Extraction جديدًا ولا تعدّل السابقة.
 * عند الفشل يرمي خطأ حتى يعيد الطابور المحاولة بتراجع تصاعدي (الخدمة قد تستعيد عملها).
 */
export async function runExtraction(
  documentId: string,
  overrides?: { provider?: string; model?: string }
): Promise<ExtractionRunResult> {
  const doc = await db.dmsDocument.findUnique({
    where: { id: documentId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!doc) throw new Error("الوثيقة غير موجودة");
  const version = doc.versions[0];
  if (!version) throw new Error("لا توجد نسخة محفوظة للوثيقة");

  const settings = await getOcrSettings(overrides);
  await db.dmsDocument.update({ where: { id: documentId }, data: { status: "EXTRACTING" } });

  const buf = await readUpload(version.storagePath);
  const startedAt = Date.now();

  try {
    if (!IMAGE_MIME.has(doc.mimeType)) {
      throw new Error(`نوع الملف ${doc.mimeType} غير مدعوم للاستخراج الآلي بعد — راجع الوثيقة يدويًا أو حوّلها إلى صورة`);
    }

    const raw = await visionComplete({
      settings,
      imageBase64: buf.toString("base64"),
      mimeType: doc.mimeType,
      prompt: buildExtractionPrompt(),
    });

    const parsed = parseOcrResponse(raw);
    const extraction = await db.extraction.create({
      data: {
        documentId,
        provider: settings.provider,
        model: settings.model,
        status: "DONE",
        confidence: parsed.confidence,
        fields: JSON.stringify(parsed.fields),
        rawText: raw.slice(0, 20_000),
        durationMs: Date.now() - startedAt,
      },
    });

    const updates: { status: string; type?: string; periodYear?: number; periodMonth?: number } = { status: "REVIEW" };
    if (parsed.docType && (DOCUMENT_TYPES as readonly string[]).includes(parsed.docType) && doc.type === "OTHER") {
      updates.type = parsed.docType;
    }
    const dateField = parsed.fields.find((f) => f.key === "date");
    if (dateField?.value && typeof dateField.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateField.value)) {
      updates.periodYear = Number(dateField.value.slice(0, 4));
      updates.periodMonth = Number(dateField.value.slice(5, 7));
    }
    await db.dmsDocument.update({ where: { id: documentId }, data: updates });

    await record({
      action: "extraction.completed",
      entity: "DmsDocument",
      entityId: documentId,
      actorType: "automation",
      actor: `ocr:${settings.provider}/${settings.model}`,
      summary: `اكتمل استخراج «${doc.title}» بثقة ${Math.round(parsed.confidence * 100)}%`,
      payload: { extractionId: extraction.id, confidence: parsed.confidence, durationMs: extraction.durationMs },
    });

    return { extractionId: extraction.id, status: "DONE", confidence: parsed.confidence, provider: settings.provider, model: settings.model };
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطأ غير متوقع أثناء الاستخراج";
    await db.extraction.create({
      data: {
        documentId,
        provider: settings.provider,
        model: settings.model,
        status: "FAILED",
        confidence: 0,
        fields: "[]",
        rawText: message,
        durationMs: Date.now() - startedAt,
      },
    });
    await db.dmsDocument.update({ where: { id: documentId }, data: { status: "REVIEW" } });

    await record({
      action: "extraction.failed",
      entity: "DmsDocument",
      entityId: documentId,
      actorType: "automation",
      actor: `ocr:${settings.provider}/${settings.model}`,
      summary: `فشل استخراج «${doc.title}»: ${message}`,
      payload: { error: message },
    });

    // التنبيه الإداري عند التعثّر النهائي يرسله الطابور نفسه (fail → DEAD)
    throw new Error(message);
  }
}

// كاش مؤقت حتى لا يضرب كل استطلاع للواجهة مزودًا سحابيًا على كل طلب
type OcrStatusValue = Awaited<ReturnType<typeof buildOcrStatus>>;
let statusCache: { at: number; value: OcrStatusValue } | null = null;

async function buildOcrStatus(settings: OcrSettings) {
  const available =
    settings.provider === "ollama" ? await isOcrAvailable(settings) : settings.apiKey ? await isOcrAvailable(settings) : null;
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.provider === "ollama" ? "محلي (Ollama)" : settings.baseUrl,
    available,
  };
}

/** حالة المزود الحالي للعرض في الواجهة */
export async function ocrStatus() {
  if (statusCache && Date.now() - statusCache.at < 60_000) return statusCache.value;
  const settings = await getOcrSettings();
  const value = await buildOcrStatus(settings);
  statusCache = { at: Date.now(), value };
  return value;
}
