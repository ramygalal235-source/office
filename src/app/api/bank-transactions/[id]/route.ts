import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { fail, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("match"), paymentId: z.string().min(1) }),
  z.object({ action: z.literal("unmatch") }),
  z.object({ action: z.literal("ignore") }),
]);

/** مطابقة سطر بنك مع سند قبض/صرف، أو إلغاء المطابقة، أو تجاهل السطر */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed));

    const companyId = await requireCompanyId();
    const tx = await db.bankTransaction.findUnique({ where: { id } });
    if (!tx || tx.companyId !== companyId) return fail("السطر غير موجود", 404);

    if (parsed.data.action === "match") {
      const payment = await db.payment.findUnique({ where: { id: parsed.data.paymentId } });
      if (!payment || payment.companyId !== companyId || payment.safeId !== tx.safeId) {
        return fail("السند غير موجود على نفس الحساب البنكي");
      }
      const alreadyMatched = await db.bankTransaction.findFirst({
        where: { matchedPaymentId: payment.id, NOT: { id: tx.id } },
      });
      if (alreadyMatched) return fail("السند مطابق لسطر بنكي آخر — ألغِ المطابقة الأولى أولًا");
      if (payment.type !== tx.direction) {
        return fail(`اتجاه السند (${payment.type === "IN" ? "تحصيل" : "صرف"}) لا يتوافق مع سطر البنك`);
      }

      const updated = await db.bankTransaction.update({
        where: { id: tx.id },
        data: { status: "MATCHED", matchedPaymentId: payment.id },
        include: {
          matchedPayment: {
            select: { id: true, number: true, amount: true, type: true, date: true, party: { select: { name: true } } },
          },
        },
      });
      return ok(updated);
    }

    if (parsed.data.action === "ignore") {
      const updated = await db.bankTransaction.update({ where: { id: tx.id }, data: { status: "IGNORED", matchedPaymentId: null } });
      return ok(updated);
    }

    // unmatch
    const updated = await db.bankTransaction.update({ where: { id: tx.id }, data: { status: "UNMATCHED", matchedPaymentId: null } });
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const companyId = await requireCompanyId();
    const tx = await db.bankTransaction.findUnique({ where: { id } });
    if (!tx || tx.companyId !== companyId) return fail("السطر غير موجود", 404);

    await db.bankTransaction.delete({ where: { id: tx.id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
