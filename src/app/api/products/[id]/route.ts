import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue, optNum, optText } from "@/lib/validators";
import { round2 } from "@/lib/money";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      include: {
        movements: { orderBy: { date: "desc" }, take: 50 },
      },
    });
    if (!product) return fail("المنتج غير موجود", 404);
    return ok(product);
  } catch (e) {
    return handleDbError(e);
  }
}

const updateSchema = z.object({
  name: optText(200),
  category: optText(100),
  unit: optText(30),
  costPrice: optNum(),
  salePrice: optNum(),
  minStock: optNum(),
  notes: optText(1000),
  isActive: z.union([z.boolean(), z.string()]).optional().transform((v) => v !== false && v !== "false"),
});

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;
    const parsed = updateSchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) return fail("المنتج غير موجود", 404);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (key === "costPrice" || key === "salePrice" || key === "minStock") data[key] = round2(Number(value));
      else if (key === "category" || key === "notes") data[key] = value || null;
      else data[key] = value;
    }

    const updated = await db.product.update({ where: { id }, data });
    await auditLog("UPDATE", "Product", id, `تعديل منتج: ${updated.name}`, user?.username);
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

/** تعديل رصيد المخزون يدويًا (تسوية جرد) — يُسجَّل كحركة ADJUST */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const user = getSessionUser(req);
    if (!user || user.role !== "admin") return fail("حذف المنتجات متاح للمدير فقط", 403);
    const { id } = await params;

    const product = await db.product.findUnique({
      where: { id },
      include: { _count: { select: { invoiceItems: true, purchaseItems: true } } },
    });
    if (!product) return fail("المنتج غير موجود", 404);
    if (product._count.invoiceItems > 0 || product._count.purchaseItems > 0)
      return fail("المنتج مرتبط بمستندات — عطّله بدل حذفه حفاظًا على تتبع حركة المخزون", 409);

    await db.product.delete({ where: { id } });
    await auditLog("DELETE", "Product", id, `حذف منتج: ${product.name}`, user?.username);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
