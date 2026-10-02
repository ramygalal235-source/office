import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { record } from "@/lib/automation/event-log";
import { createDraftFromExtraction, type CreatedDraft } from "@/lib/ocr/drafts";
import { fieldByKey, type OcrField } from "@/lib/ocr/prompt";

interface ApproveBody {
  extractionId?: string;
  /** حقول بعد تصحيح المراجع (اختياري — بدونه تُعتمد كما استُخرِجت) */
  fields?: OcrField[];
  createDraft?: boolean;
}

/**
 * بوابة الاعتماد: يراجع المحاسب الاستخراج (ويصحح ما يشاء) ثم يعتمد.
 * الاعتماد وحده يولّد مستندًا مسودة — لا يُرحَّل أي شيء آليًا إلى قيود اليومية.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as ApproveBody | null;
    if (!body) return fail("بيانات الاعتماد غير صالحة");

    const doc = await db.dmsDocument.findUnique({
      where: { id },
      include: { extractions: { orderBy: { createdAt: "desc" } } },
    });
    if (!doc) return fail("الوثيقة غير موجودة", 404);

    const extraction =
      (body.extractionId ? doc.extractions.find((e) => e.id === body.extractionId) : undefined) ??
      doc.extractions.find((e) => e.status === "DONE") ??
      doc.extractions[0];
    if (!extraction) return fail("لا يوجد استخراج ليعتمد — شغّل الاستخراج أولًا");

    let fields: OcrField[] = [];
    try {
      fields = JSON.parse(extraction.fields) as OcrField[];
    } catch {
      fields = [];
    }

    // تصحيحات المراجع تُحفظ على نفس الاستخراج (يبقى السجل قابلًا للتتبع):
    // الحقل الذي غيّره المراجع يصبح الثقة 1 (تدخّل بشري) مع بقاء raw لما قرأه النموذج
    if (Array.isArray(body.fields) && body.fields.length) {
      const corrected = fields.map((f) => {
        const fix = body.fields!.find((b) => b.key === f.key);
        if (!fix) return f;
        const changed = String(f.value ?? "") !== String(fix.value ?? "");
        if (!changed) return f;
        return { ...f, value: fix.value, confidence: 1 };
      });
      const withValues = corrected.filter((f) => f.value != null);
      const confidence = withValues.length ? withValues.reduce((s, f) => s + f.confidence, 0) / withValues.length : 0;
      await db.extraction.update({
        where: { id: extraction.id },
        data: {
          fields: JSON.stringify(corrected),
          confidence,
          reviewedBy: user?.username ?? null,
          reviewedAt: new Date(),
        },
      });
      fields = corrected;
    } else {
      await db.extraction.update({
        where: { id: extraction.id },
        data: { reviewedBy: user?.username ?? null, reviewedAt: new Date() },
      });
    }

    const docType = (fieldByKey(fields, "doc_type")?.value as string | undefined)?.toUpperCase() ?? doc.type;
    await db.dmsDocument.update({ where: { id }, data: { status: "APPROVED", ...(docType !== doc.type ? { type: docType } : {}) } });

    let draft: CreatedDraft | null = null;
    if (body.createDraft !== false) {
      draft = await createDraftFromExtraction(id, doc.title, docType, doc.clientId, fields, user?.username ?? "ocr");
      if (draft) {
        await record({
          action: "document.draft_created",
          entity: "DmsDocument",
          entityId: id,
          actorType: "human",
          actor: user?.username ?? "unknown",
          summary: `اعتماد «${doc.title}» — أُنشئت مسودة ${draft.kind === "INVOICE" ? "فاتورة" : draft.kind === "PURCHASE" ? "مستند شراء" : "تحصيل"} ${draft.number}`,
          payload: { draftKind: draft.kind, draftId: draft.id, draftNumber: draft.number },
        });
      }
    }

    await record({
      action: "document.approved",
      entity: "DmsDocument",
      entityId: id,
      actorType: "human",
      actor: user?.username ?? "unknown",
      summary: `اعتماد وثيقة «${doc.title}» بعد المراجعة`,
      payload: { extractionId: extraction.id, draft: draft ?? undefined },
    });
    await auditLog("UPDATE", "DmsDocument", id, `اعتماد وثيقة ${doc.title}${draft ? ` → ${draft.number}` : ""}`, user?.username);

    return ok({ document: { id, status: "APPROVED" }, draft });
  } catch (e) {
    return handleDbError(e);
  }
}
