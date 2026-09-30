import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { round2 } from "@/lib/money";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

/** تسوية جرد: تعديل الرصيد يدويًا مع تسجيل حركة ADJUST كاملة */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as { delta?: number; unitCost?: number; notes?: string } | null;
    const parsed = z.object({ delta: z.number().refine((n) => n !== 0, "الفرق لا يمكن أن يكون صفرًا"), unitCost: z.number().min(0).default(0), notes: z.string().max(500).optional() }).safeParse(body);
    if (!parsed.success) return fail("بيانات التسوية غير صالحة");

    const product = await db.product.findUnique({ where: { id } });
    if (!product) return fail("المنتج غير موجود", 404);

    const newQty = round2(product.quantity + parsed.data.delta);
    if (newQty < 0) return fail(`الرصيد سيبقى سالبًا (${newQty}) — لا يمكن التسوية`, 400);

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.product.update({ where: { id }, data: { quantity: newQty } });
      const movement = await tx.stockMovement.create({
        data: {
          productId: id,
          type: "ADJUST",
          companyId: product.companyId ?? undefined,
          quantity: parsed.data.delta,
          unitCost: parsed.data.unitCost,
          notes: parsed.data.notes || "تسوية جرد",
          createdBy: user?.username ?? "system",
        },
      });
      return { updated, movement };
    });

    await auditLog("UPDATE", "Product", id, `تسوية مخزون ${product.name}: ${parsed.data.delta > 0 ? "+" : ""}${parsed.data.delta} → ${newQty}`, user?.username);
    return ok(result);
  } catch (e) {
    return handleDbError(e);
  }
}
