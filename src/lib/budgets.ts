// ===== الموازنات: المخطَّط مقابل الفعلي =====
// الموازنة: سنة مالية + نوع (مصروفات/إيرادات) + أسطر (حساب × مبلغ شهري أو سنوي).
// الفعلي: من أسطر قيود اليومية المرحَّلة لكل حساب خلال السنة المالية
// (مصروف = مدين − دائن، إيراد = دائن − مدين) — يُحدَّث عند الطلب من الشاشة.
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { PostingError } from "@/lib/accounting/posting";
import { appendEvent } from "@/lib/automation/event-log";

const MONTHS = 12;

/** حساب سنة مالية: تبدأ في شهر fiscalYearStart (من شركة المكتب) حتى نهايتها */
export async function fiscalYearMonths(fiscalYear: number): Promise<{ startMonth: number; months: { year: number; month: number }[] }> {
  const setting = await db.setting.findUnique({ where: { key: "company.fiscalYearStart" } });
  const company = await db.company.findFirst();
  const startMonth = company?.fiscalYearStart ?? Number(setting?.value ?? 1);
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(fiscalYear, startMonth - 1 + i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return { startMonth, months };
}

/** الفعلي لحساب واحد لشهر معين من القيود المرحَّلة */
async function accountActual(accountId: string, year: number, month: number, isExpense: boolean): Promise<number> {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const rows = await db.journalLine.findMany({
    where: {
      accountId,
      journalEntry: { status: "POSTED", date: { gte: start, lt: end } },
    },
    select: { debit: true, credit: true },
  });
  const raw = rows.reduce((a, r) => a + (isExpense ? r.debit - r.credit : r.credit - r.debit), 0);
  return round2(raw);
}

/** إعادة حساب الأرصدة الفعلية لكل أسطر الموازنة (حتى الشهر الحالي من السنة المالية) */
export async function refreshBudgetActuals(budgetId: string, user = "system") {
  const budget = await db.budget.findUnique({
    where: { id: budgetId },
    include: { lines: true },
  });
  if (!budget) throw new PostingError("الموازنة غير موجودة");

  const { startMonth, months } = await fiscalYearMonths(budget.fiscalYear);
  const isExpense = budget.type === "EXPENSE";
  const now = new Date();
  // حتى أي شهر؟: آخر شهر من السنة المالية إن انتهت، وإلا الشهر الحالي
  const fyEnd = new Date(months[11].year, months[11].month, 1);
  const upTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const effectiveEnd = fyEnd < upTo ? fyEnd : upTo;

  const accounts = await db.account.findMany({
    where: { id: { in: budget.lines.map((l) => l.accountId).filter(Boolean) as string[] } },
    select: { id: true },
  });
  const validAccountIds = new Set(accounts.map((a) => a.id));

  for (const line of budget.lines) {
    if (!line.accountId || !validAccountIds.has(line.accountId)) {
      await db.budgetLine.update({ where: { id: line.id }, data: { actualAmount: 0 } });
      continue;
    }
    if (line.periodMonth !== null && line.periodMonth !== undefined) {
      // سطر شهري: الفعلي لهذا الشهر فقط (إن كان قد مضى)
      const m = months.find((x) => x.month === line.periodMonth);
      if (!m || new Date(m.year, m.month, 0) >= effectiveEnd) {
        await db.budgetLine.update({ where: { id: line.id }, data: { actualAmount: 0 } });
        continue;
      }
      const actual = await accountActual(line.accountId, m.year, m.month, isExpense);
      await db.budgetLine.update({ where: { id: line.id }, data: { actualAmount: actual } });
      continue;
    }
    // سطر سنوي: مجموع الفعلي عبر شهور السنة المالية (حتى الآن)
    let actual = 0;
    for (const { year, month } of months) {
      if (new Date(year, month, 0) >= effectiveEnd) break;
      actual += await accountActual(line.accountId, year, month, isExpense);
    }
    await db.budgetLine.update({ where: { id: line.id }, data: { actualAmount: round2(actual) } });
  }

  await appendEvent({
    action: "REFRESH",
    entity: "Budget",
    entityId: budgetId,
    actorType: "human",
    actor: user,
    summary: `تحديث الفعلي لموازنة «${budget.name}» (${budget.fiscalYear})`,
  });
  return { ok: true, startMonth };
}
