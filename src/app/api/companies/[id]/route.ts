import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { companySchema } from "../schema";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const item = await db.clientCompany.findUnique({
      where: { id },
      include: {
        obligations: { orderBy: { dueDate: "desc" }, take: 50 },
        tasks: { orderBy: { createdAt: "desc" }, take: 50 },
        documents: { orderBy: { createdAt: "desc" }, take: 20 },
        _count: { select: { invoices: true, purchases: true } },
      },
    });
    if (!item) return fail("شركة العميل غير موجودة", 404);
    return ok(item);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    // PUT يقبل تعديلًا جزئيًا: الحقول غير المُرسلة تبقى كما هي
    const parsed = companySchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const existing = await db.clientCompany.findUnique({ where: { id } });
    if (!existing) return fail("شركة العميل غير موجودة", 404);

    const user = getSessionUser(req);
    const data = parsed.data;
    // نحذف الحقول غير المُرسلة فقط — الباقي يُحدَّث
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      if (data[key] === undefined) delete data[key];
    }
    const updated = await db.clientCompany.update({ where: { id }, data });
    await auditLog("UPDATE", "ClientCompany", id, `تعديل بيانات ${updated.nameAr}`, user?.username);
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const existing = await db.clientCompany.findUnique({ where: { id } });
    if (!existing) return fail("شركة العميل غير موجودة", 404);

    const user = getSessionUser(req);
    await db.clientCompany.delete({ where: { id } });
    await auditLog("DELETE", "ClientCompany", id, `حذف شركة العميل ${existing.nameAr}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
