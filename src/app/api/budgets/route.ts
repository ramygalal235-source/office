import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { auditLog, fail, generateNumber, handleDbError, ok } from "@/lib/accounting/api";

/** قائمة الموازنات (بأسطرها) */
export async function GET() {
  try {
    const companyId = await requireCompanyId();
    const budgets = await db.budget.findMany({
      where: { companyId },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      orderBy: [{ fiscalYear: "desc" }, { createdAt: "desc" }],
    });
    // نرتّب أسطر كل موازنة حسب الشهر (لا يدعم include المتداخل orderBy في هذا الإصدار)
    for (const b of budgets) b.lines.sort((a, z) => (a.periodMonth ?? 0) - (z.periodMonth ?? 0));
    return ok(budgets);
  } catch (e) {
    return handleDbError(e);
  }
}

/** إنشاء موازنة (سنة مالية + نوع + أسطر) */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      fiscalYear?: number;
      type?: string;
      notes?: string;
      lines?: { accountId?: string; amount?: number; periodMonth?: number | null; notes?: string }[];
    } | null;
    const fiscalYear = Number(body?.fiscalYear);
    if (!fiscalYear || fiscalYear < 2000 || fiscalYear > 2100) return fail("سنة مالية غير صالحة", 400);
    if (body?.type !== "EXPENSE" && body?.type !== "REVENUE") return fail("نوع الموازنة: مصروفات أو إيرادات", 400);
    const lines = (body?.lines ?? []).filter((l) => l.accountId && (Number(l.amount) || 0) !== 0);
    if (lines.length === 0) return fail("أضف سطرًا واحدًا على الأقل بحساب ومبلغ", 400);

    const accounts = await db.account.findMany({
      where: { id: { in: lines.map((l) => l.accountId!) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
    const missing = lines.filter((l) => !nameOf.has(l.accountId!));
    if (missing.length) return fail("حساب غير موجود في الدليل", 400);

    const code = await generateNumber("BUDGET");
    const companyId = await requireCompanyId();
    const budget = await db.budget.create({
      data: {
        name: `${body?.type === "EXPENSE" ? "موازنة مصروفات" : "موازنة إيرادات"} ${fiscalYear} (${code})`,
        companyId,
        fiscalYear,
        type: body!.type,
        status: "DRAFT",
        notes: body?.notes ?? null,
        lines: {
          create: lines.map((l) => ({
            accountId: l.accountId!,
            categoryName: nameOf.get(l.accountId!)!,
            amount: Number(l.amount) || 0,
            periodMonth: l.periodMonth ? Number(l.periodMonth) : null,
            notes: l.notes ?? null,
          })),
        },
      },
      include: { lines: true },
    });
    await auditLog("CREATE", "Budget", budget.id, `إنشاء ${budget.name}`);
    return ok(budget);
  } catch (e) {
    return handleDbError(e);
  }
}
