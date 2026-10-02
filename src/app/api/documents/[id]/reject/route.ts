import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { record } from "@/lib/automation/event-log";

interface RejectBody {
  reason?: string;
}

/** رفض الوثيقة — تبقى في الأرشيف مع السبب (لا حذف صامت) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as RejectBody | null;

    const doc = await db.dmsDocument.findUnique({ where: { id } });
    if (!doc) return fail("الوثيقة غير موجودة", 404);

    await db.dmsDocument.update({
      where: { id },
      data: { status: "REJECTED", notes: [doc.notes, body?.reason ? `مرفوضة: ${body.reason}` : "مرفوضة"].filter(Boolean).join(" | ") },
    });

    await record({
      action: "document.rejected",
      entity: "DmsDocument",
      entityId: id,
      actorType: "human",
      actor: user?.username ?? "unknown",
      summary: `رفض وثيقة «${doc.title}»${body?.reason ? ` — السبب: ${body.reason}` : ""}`,
      payload: { reason: body?.reason ?? null },
    });
    await auditLog("UPDATE", "DmsDocument", id, `رفض وثيقة ${doc.title}`, user?.username);

    return ok({ document: { id, status: "REJECTED" } });
  } catch (e) {
    return handleDbError(e);
  }
}
