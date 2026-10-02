import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { PostingError } from "./posting";
import { getTrialBalance } from "./ledger";

// ===== إغلاق الشهر: قائمة فحص + قفل الفترة =====
//
// الروتين الشهرية: نفحص ما يستحق أن ينتهي قبل قفل الشهر (رحيل الرواتب،
// القيود المسودة، توازن ميزان المراجعة…)، ثم نسجّل الإغلاق في MonthClose.
// الإغلاق يقفل الفترة: أي قيد بتاريخ داخلها يرفضه postJournal حتى إعادة الفتح.

export type CloseCheck = {
  key: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  detail: string;
};

const periodDates = (year: number, month: number) => ({
  from: new Date(year, month - 1, 1),
  to: new Date(year, month, 0, 23, 59, 59, 999),
});

/** فحص شهر (قراءة فقط) — لا يكتب شيئًا */
export async function runMonthCloseChecks(companyId: string, year: number, month: number): Promise<CloseCheck[]> {
  const { from, to } = periodDates(year, month);
  const inPeriod = { gte: from, lte: to };
  const periodLabel = `${month}/${year}`;

  const [draftJournals, payrollRun, unpostedInvoices, unpostedPurchases, depreciationEntries, unmatchedBank, activeEmployees, trial] =
    await Promise.all([
      db.journalEntry.count({ where: { companyId, status: "DRAFT", date: inPeriod } }),
      db.payrollRun.findFirst({ where: { companyId, periodYear: year, periodMonth: month } }),
      db.invoice.count({ where: { companyId, date: inPeriod, status: { notIn: ["DRAFT", "CANCELLED"] }, journalPosted: false } }),
      db.purchase.count({ where: { companyId, date: inPeriod, status: { notIn: ["DRAFT", "CANCELLED"] }, journalPosted: false } }),
      db.journalEntry.count({ where: { companyId, sourceType: "ASSET_DEPRECIATION", date: inPeriod } }),
      db.bankTransaction.count({ where: { companyId, status: "UNMATCHED" } }),
      db.employee.count({ where: { companyId, isActive: true } }),
      getTrialBalance({ from, to }, companyId),
    ]);

  const checks: CloseCheck[] = [];

  checks.push({
    key: "payroll",
    label: "شغل الرواتب للشهر",
    blocking: activeEmployees > 0,
    ok: !!payrollRun && payrollRun.status === "POSTED",
    detail:
      activeEmployees === 0
        ? "لا موظفين نشطين — لا شغل مطلوب"
        : payrollRun === null
          ? "لم يُنشأ شغل رواتب لهذا الشهر"
          : payrollRun.status === "POSTED"
            ? "مرحّل إلى اليومية"
            : `شغل موجود بحالة «${payrollRun.status}» — رحّله أولًا`,
  });

  checks.push({
    key: "draft_journals",
    label: "القيود المسودة",
    blocking: true,
    ok: draftJournals === 0,
    detail: draftJournals === 0 ? "لا قيود مسودة في الفترة" : `${draftJournals} قيد مسودة في الفترة — رحّلها أو احذفها`,
  });

  checks.push({
    key: "invoices",
    label: "فواتير البيع غير المرحّلة",
    blocking: true,
    ok: unpostedInvoices === 0,
    detail: unpostedInvoices === 0 ? "كل فواتير الفترة مرحّلة" : `${unpostedInvoices} فاتورة في الفترة لم تُرحّل لليومية`,
  });

  checks.push({
    key: "purchases",
    label: "فواتير الشراء غير المرحّلة",
    blocking: true,
    ok: unpostedPurchases === 0,
    detail: unpostedPurchases === 0 ? "كل فواتير الشراء في الفترة مرحّلة" : `${unpostedPurchases} فاتورة شراء في الفترة لم تُرحّل لليومية`,
  });

  checks.push({
    key: "depreciation",
    label: "الإهلاك الشهري",
    blocking: false,
    ok: depreciationEntries > 0,
    detail: depreciationEntries > 0 ? `تم ترحيل ${depreciationEntries} قيد إهلاك` : "لا قيود إهلاك في الفترة — تأكد إن كان للأصول استحقاق",
  });

  checks.push({
    key: "bank_recon",
    label: "مطابقة البنك",
    blocking: false,
    ok: unmatchedBank === 0,
    detail: unmatchedBank === 0 ? "لا أسطر بنكية غير مطابقة" : `${unmatchedBank} سطرًا بنكيًا غير مطابق — يُفضّل معالجتها قبل الإغلاق`,
  });

  checks.push({
    key: "trial_balance",
    label: "توازن ميزان المراجعة",
    blocking: true,
    ok: trial.balanced,
    detail: trial.balanced
      ? "متوازن (مدين = دائن)"
      : `غير متوازن: مدين ${round2(trial.totalDebit)} / دائن ${round2(trial.totalCredit)} — فارق ${round2(trial.totalDebit - trial.totalCredit)}`,
  });

  return checks;
}

/** إغلاق شهر: يمرّ كل فحص الحاسم، ثم يسجّل الإغلاق مع لقطة الفحوصات */
export async function closeMonth(companyId: string, year: number, month: number, user: string) {
  const existing = await db.monthClose.findUnique({
    where: { companyId_year_month: { companyId, year, month } },
  });
  if (existing) return { skipped: true as const, existing };

  const checks = await runMonthCloseChecks(companyId, year, month);
  const failed = checks.filter((c) => c.blocking && !c.ok);
  if (failed.length > 0) {
    throw new PostingError(`لا يمكن إغلاق ${month}/${year} — ${failed.map((c) => `${c.label}: ${c.detail}`).join(" | ")}`);
  }

  const record = await db.monthClose.create({
    data: {
      companyId,
      year,
      month,
      closedBy: user,
      checks: JSON.stringify(checks.map((c) => ({ key: c.key, ok: c.ok, detail: c.detail }))),
    },
  });
  return { skipped: false as const, record, checks };
}

/** إعادة فتح فترة مغلقة */
export async function reopenMonth(companyId: string, year: number, month: number) {
  const existing = await db.monthClose.findUnique({
    where: { companyId_year_month: { companyId, year, month } },
  });
  if (!existing) return { skipped: true };
  await db.monthClose.delete({ where: { id: existing.id } });
  return { skipped: false, reopened: { year, month } };
}
