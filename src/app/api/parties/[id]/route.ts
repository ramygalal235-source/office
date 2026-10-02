import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { partySchema } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const parsed = partySchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const existing = await db.party.findUnique({ where: { id } });
    if (!existing) return fail("الطرف غير موجود", 404);

    const data = parsed.data;
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      if (data[key] === undefined) delete data[key];
    }

    const user = getSessionUser(req);
    const updated = await db.party.update({ where: { id }, data });
    await auditLog("UPDATE", "Party", id, `تعديل ${updated.name}`, user?.username);
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const existing = await db.party.findUnique({ where: { id } });
    if (!existing) return fail("الطرف غير موجود", 404);

    const user = getSessionUser(req);
    await db.party.delete({ where: { id } });
    await auditLog("DELETE", "Party", id, `حذف ${existing.name}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
