import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { fail, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue, optDate, optNum, optText, reqDate } from "@/lib/validators";
import { getHandler } from "@/lib/automation/handlers";
import { round2 } from "@/lib/money";

const FREQS = ["MONTHLY", "QUARTERLY", "ANNUALLY"];

const updateSchema = z.object({
  name: optText(200),
  customerId: optText(30).nullable(),
  amount: optNum(),
  frequency: z.enum(FREQS as const),
  nextDueDate: reqDate(),
  notes: optText(1000).nullable(),
  active: z.boolean(),
});

const actionSchema = z.object({ action: z.literal("generate") });

type Ctx = { params: Promise<{ id: string }> };

async function findOwned(id: string) {
  const companyId = await requireCompanyId();
  const item = await db.recurringInvoice.findUnique({ where: { id } });
  if (!item || (item.companyId ?? null) !== companyId) return null;
  return item;
}

/** توليد يدوي الآن للفواتير المستحقة لهذا النموذج */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (actionSchema.safeParse(body).success) {
      const item = await findOwned(id);
      if (!item) return fail("النموذج غير موجود", 404);
      const handler = getHandler("recurring.generate_invoices");
      if (!handler) return fail("معالج التوليد غير مسجل", 500);
      const result = await handler({ recurringId: id });
      return ok(result);
    }
    return fail("إجراء غير معروف");
  } catch (e) {
    return handleDbError(e);
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const parsed = updateSchema.partial().safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed));

    const item = await findOwned(id);
    if (!item) return fail("النموذج غير موجود", 404);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value === undefined) continue;
      if (key === "amount") data.amount = round2(value as number);
      else if (key === "customerId" && value !== null) {
        const customer = await db.party.findUnique({ where: { id: value } });
        if (!customer || customer.type !== "CUSTOMER") return fail("العميل غير موجود");
        data.customerId = value;
      } else data[key] = value;
    }

    const updated = await db.recurringInvoice.update({
      where: { id },
      data,
      include: { customer: { select: { id: true, name: true } } },
    });
    return ok(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const item = await findOwned(id);
    if (!item) return fail("النموذج غير موجود", 404);
    // لا قيد أجنبي على Invoice.recurringId — نظّفنا الإشارة قبل الحذف
    await db.invoice.updateMany({ where: { recurringId: id }, data: { recurringId: null } });
    await db.recurringInvoice.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
