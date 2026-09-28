import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { z } from "zod";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const engagement = await db.engagement.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, nameAr: true, taxNumber: true } },
        service: { select: { id: true, name: true, code: true, slaDays: true, billingType: true } },
        members: { include: { user: { select: { id: true, name: true, role: true } } } },
        tasks: { orderBy: [{ dueDate: "asc" }], take: 100, include: { assignedToUser: { select: { id: true, name: true } } } },
        times: { orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } } },
        documents: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!engagement) return fail("ملف العمل غير موجود", 404);
    return ok(engagement);
  } catch (e) {
    return handleDbError(e);
  }
}

const updateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "CLOSED"]).optional(),
  feeAmount: z.number().min(0).optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;
    const parsed = updateSchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const existing = await db.engagement.findUnique({ where: { id } });
    if (!existing) return fail("ملف العمل غير موجود", 404);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (key === "dueDate") data.dueDate = new Date(String(value));
      else if (key === "status" && value === "CLOSED") data.closedAt = new Date();
      else data[key] = value;
    }

    const updated = await db.engagement.update({
      where: { id },
      data,
      include: { client: { select: { nameAr: true } } },
    });

    const statusNote = parsed.data.status ? ` — تغيير الحالة إلى ${parsed.data.status}` : "";
    await auditLog("UPDATE", "Engagement", id, `تحديث ملف عمل ${updated.code}${statusNote}`, user?.username);
    return ok({ engagement: updated });
  } catch (e) {
    return handleDbError(e);
  }
}

/** إغلاق ملف — الإغلاق قرار إداري فيُقيَّد بالاسم */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getSessionUser(req);
    if (!user || user.role !== "admin") return fail("حذف ملفات العمل متاح للمدير فقط", 403);
    const { id } = await params;

    const existing = await db.engagement.findUnique({ where: { id } });
    if (!existing) return fail("ملف العمل غير موجود", 404);
    if (existing.status !== "CLOSED") return fail("يجب إغلاق الملف قبل حذفه", 409);

    await db.engagement.delete({ where: { id } });
    await auditLog("DELETE", "Engagement", id, `حذف ملف عمل ${existing.code}`, user?.username);
    return ok({ id });
  } catch (e) {
    return handleDbError(e);
  }
}
