import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { fail, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue, optNum, optText, reqDate, reqText } from "@/lib/validators";
import { round2 } from "@/lib/money";

const createSchema = z.object({
  safeId: reqText(30, "اختر الحساب البنكي"),
  date: reqDate(),
  amount: optNum().refine((n) => n > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  direction: z.enum(["IN", "OUT"]).default("IN"),
  reference: optText(100),
  description: optText(300),
});

// كشف سطور البنك لخزينة بنكية + إنشاء سطر
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const safeId = url.searchParams.get("safeId") ?? "";
    if (!safeId) return fail("safeId مطلوب");

    const companyId = await requireCompanyId();
    const safe = await db.safe.findUnique({ where: { id: safeId } });
    if (!safe || safe.companyId !== companyId || safe.type !== "BANK") return fail("الحساب البنكي غير موجود", 404);

    const items = await db.bankTransaction.findMany({
      where: { safeId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: {
        matchedPayment: {
          select: { id: true, number: true, amount: true, type: true, date: true, party: { select: { name: true } } },
        },
      },
    });
    return ok(items);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed));

    const companyId = await requireCompanyId();
    const safe = await db.safe.findUnique({ where: { id: parsed.data.safeId } });
    if (!safe || safe.companyId !== companyId || safe.type !== "BANK") return fail("الحساب البنكي غير موجود", 404);

    const item = await db.bankTransaction.create({
      data: {
        companyId,
        safeId: safe.id,
        date: parsed.data.date,
        amount: round2(parsed.data.amount),
        direction: parsed.data.direction,
        reference: parsed.data.reference ?? null,
        description: parsed.data.description ?? null,
      },
    });
    return ok(item);
  } catch (e) {
    return handleDbError(e);
  }
}
