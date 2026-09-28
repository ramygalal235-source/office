import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { enqueue } from "@/lib/automation/queue";
import { record } from "@/lib/automation/event-log";

interface ReExtractBody {
  provider?: string;
  model?: string;
}

/** إعادة الاستخراج (بمزود/نموذج آخر إن رغب المراجع) — محاولة جديدة في السجل */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as ReExtractBody;

    const doc = await db.dmsDocument.findUnique({ where: { id } });
    if (!doc) return fail("الوثيقة غير موجودة", 404);

    const provider = body.provider === "ollama" || body.provider === "zai" || body.provider === "custom" ? body.provider : undefined;
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;

    const { job, created } = await enqueue({
      type: "document.extract",
      payload: { documentId: id, ...(provider ? { provider } : {}), ...(model ? { model } : {}) },
      idempotencyKey: `extract:${id}:re:${Date.now()}`,
      priority: 80,
    });

    await db.dmsDocument.update({ where: { id }, data: { status: "UPLOADED" } });
    await record({
      action: "document.re_extract_queued",
      entity: "DmsDocument",
      entityId: id,
      actorType: "user",
      actor: user?.username ?? "unknown",
      summary: `إعادة استخراج «${doc.title}»${provider ? ` بمزوّد ${provider}` : ""}${model ? ` بالنموذج ${model}` : ""}`,
      payload: { jobId: job.id, provider: provider ?? null, model: model ?? null },
    });

    return ok({ job: { id: job.id, created } });
  } catch (e) {
    return handleDbError(e);
  }
}
