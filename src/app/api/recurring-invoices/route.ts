import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { fail, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue, optDate, optNum, optText, reqDate, reqText } from "@/lib/validators";
import { round2 } from "@/lib/money";

const FREQS = ["MONTHLY", "QUARTERLY", "ANNUALLY"];

const createSchema = z.object({
  name: reqText(200, "اسم النموذج مطلوب"),
  customerId: optText(30),
  amount: optNum().refine((n) => n > 0, "المبلغ يجب أن يكون أكبر من صفر"),
  frequency: z.enum(FREQS as const).default("MONTHLY"),
  nextDueDate: reqDate(),
  notes: optText(1000),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const companyId = await requireCompanyId();

    const items = await db.recurringInvoice.findMany({
      where: { companyId, ...(q ? { name: { contains: q } } : {}) },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: [{ active: "desc" }, { nextDueDate: "asc" }],
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
    if (parsed.data.customerId) {
      const customer = await db.party.findUnique({ where: { id: parsed.data.customerId } });
      if (!customer || customer.type !== "CUSTOMER" || (customer.companyId ?? null) !== companyId) {
        return fail("العميل غير موجود على هذه الشركة");
      }
    }

    const item = await db.recurringInvoice.create({
      data: {
        companyId,
        name: parsed.data.name,
        customerId: parsed.data.customerId ?? null,
        amount: round2(parsed.data.amount),
        frequency: parsed.data.frequency,
        nextDueDate: parsed.data.nextDueDate,
        notes: parsed.data.notes ?? null,
      },
      include: { customer: { select: { id: true, name: true } } },
    });
    return ok(item);
  } catch (e) {
    return handleDbError(e);
  }
}
