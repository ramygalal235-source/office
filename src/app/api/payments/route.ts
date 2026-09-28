import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, fail, generateNumber, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue, optEnum, optNum, optText, reqDate, reqText } from "@/lib/validators";
import { PAYMENT_METHODS, PAYMENT_TYPES } from "@/lib/domain";
import { round2 } from "@/lib/money";

const paymentSchema = z.object({
  type: optEnum(PAYMENT_TYPES.map((t) => t.value), "IN"),
  partyId: optText(30),
  safeId: reqText(30, "اختر الخزينة أو الحساب البنكي"),
  date: reqDate(),
  amount: optNum().refine((n) => n > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  method: optEnum(PAYMENT_METHODS.map((m) => m.value), "CASH"),
  reference: optText(100),
  sourceType: optText(30),
  sourceId: optText(30),
  notes: optText(1000),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const type = url.searchParams.get("type") ?? "";
    const safeId = url.searchParams.get("safeId") ?? "";

    const where = { ...(type ? { type } : {}), ...(safeId ? { safeId } : {}) };

    const [items, total, sums, posted] = await Promise.all([
      db.payment.findMany({
        where,
        include: { party: { select: { id: true, name: true } }, safe: { select: { id: true, name: true } } },
        orderBy: { date: "desc" },
        skip,
        take,
      }),
      db.payment.count({ where }),
      db.payment.groupBy({ by: ["type"], where, _sum: { amount: true } }),
      db.journalEntry.findMany({
        where: { sourceType: "PAYMENT", sourceId: { in: items.map((p) => p.id) } },
        select: { sourceId: true },
      }),
    ]);

    const postedSet = new Set(posted.map((e) => e.sourceId));
    const withPosted = items.map((p) => ({ ...p, journalPosted: postedSet.has(p.id) }));

    return ok(withPosted, { page, limit, total, pages: Math.ceil(total / limit), totals: sums });
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = paymentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const user = getSessionUser(req);
    const number = await generateNumber(parsed.data.type === "IN" ? "PAYMENT_IN" : "PAYMENT_OUT");

    const created = await db.payment.create({
      data: { ...parsed.data, number, amount: round2(parsed.data.amount), partyId: parsed.data.partyId || null },
      include: { party: true, safe: true },
    });

    await auditLog("CREATE", "Payment", created.id, `${parsed.data.type === "IN" ? "سند قبض" : "سند صرف"} ${number}`, user?.username);
    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
