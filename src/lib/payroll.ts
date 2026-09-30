/** ضريبة الدخل بالتدرج (شهري) على صافي ما بعد التأمين */
export function computeWht(taxable: number, brackets: WhtBracket[]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = Number.isFinite(b.upTo) ? b.upTo : Infinity;
    if (taxable <= lower) break;
    const slice = Math.min(taxable, upper) - lower;
    tax += slice * (b.rate / 100);
    lower = upper;
    if (!Number.isFinite(upper)) break;
  }
  return round2(tax);
}

export type PayslipBreakdown = {
  gross: number;
  employerInsurance: number;
  insurance: number;
  taxable: number;
  tax: number;
  net: number;
  expenseTotal: number;
};

/** حساب قسيمة راتب موظف — بلا كتابة */
export function computePayslip(
  emp: { basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowance: number },
  extras: { overtime?: number; bonuses?: number; otherDeductions?: number },
  params: PayrollParams
): PayslipBreakdown {
  const allowances = emp.housingAllowance + emp.transportAllowance + emp.otherAllowance;
  const gross = round2(emp.basicSalary + allowances + (extras.overtime ?? 0) + (extras.bonuses ?? 0));
  const insured = Math.min(gross, params.insuranceCeiling);
  const insurance = round2((insured * params.insuranceRate) / 100);
  const employerInsurance = round2((insured * params.employerInsuranceRate) / 100);
  const taxable = Math.max(0, round2(gross - insurance));
  const tax = computeWht(taxable, params.whtBrackets);
  const otherDeductions = extras.otherDeductions ?? 0;
  const net = round2(gross - insurance - tax - otherDeductions);
  const expenseTotal = round2(gross + employerInsurance);
  return { gross, employerInsurance, insurance, taxable, tax, net, expenseTotal };
}

/** إنشاء شغل راتب لفترة (DRAFT) لكل الموظفين النشطين — فريد للفترة والشركة */
export async function runPayroll(
  year: number,
  month: number,
  user: string = "system",
  companyId: string
) {
  const existing = await db.payrollRun.findUnique({
    where: { companyId_periodYear_periodMonth: { companyId, periodYear: year, periodMonth: month } },
  });
  if (existing) {
    throw new PostingError(`توجد شغل رواتب بالفعل للفترة ${month}/${year} بحالة «${existing.status}»`);
  }

  const [employees, params] = await Promise.all([
    db.employee.findMany({ where: { isActive: true, companyId }, orderBy: { code: "asc" } }),
    getPayrollParams(),
  ]);
  if (employees.length === 0) throw new PostingError("لا يوجد موظفون نشطون — أضف الموظفين أولًا");

  const date = new Date(year, month - 1, 28);
  const run = await db.payrollRun.create({
    data: {
      companyId,
      periodYear: year,
      periodMonth: month,
      status: "DRAFT",
      createdBy: user,
      payslips: {
        create: employees.map((emp) => {
          const b = computePayslip(emp, {}, params);
          return {
            employeeId: emp.id,
            basic: emp.basicSalary,
            allowances: emp.housingAllowance + emp.transportAllowance + emp.otherAllowance,
            overtime: 0,
            bonuses: 0,
            insurance: b.insurance,
            tax: b.tax,
            otherDeductions: 0,
            net: b.net,
          };
        }),
      },
    },
    include: { payslips: { include: { employee: { select: { name: true, code: true } } } } },
  });

  const totals = await computeRunTotals(run.id);
  await db.payrollRun.update({
    where: { id: run.id },
    data: { totalGross: totals.gross, totalDeductions: totals.deductions, totalNet: totals.net },
  });

  await appendEvent({
    action: "CREATE",
    entity: "PayrollRun",
    entityId: run.id,
    actorType: "human",
    actor: user,
    summary: `شغل رواتب ${month}/${year} (${employees.length} موظفًا) — صافي ${totals.net.toFixed(2)}`,
  });
  return { ...run, totalGross: totals.gross, totalDeductions: totals.deductions, totalNet: totals.net, date };
}

export async function computeRunTotals(runId: string) {
  const payslips = await db.payslip.findMany({ where: { payrollRunId: runId } });
  let gross = 0;
  let deductions = 0;
  let net = 0;
  for (const ps of payslips) {
    gross += ps.basic + ps.allowances + ps.overtime + ps.bonuses;
    deductions += ps.insurance + ps.tax + ps.otherDeductions;
    net += ps.net;
  }
  return { gross: round2(gross), deductions: round2(deductions), net: round2(net) };
}

/** ترحيل شغل رواتب (DRAFT → POSTED) — قيد يومية متوازن */
export async function postPayrollRun(runId: string, user: string = "system") {
  const run = await db.payrollRun.findUnique({
    where: { id: runId },
    include: { payslips: true },
  });
  if (!run) throw new PostingError("شغل الرواتب غير موجود");
  if (run.status === "POSTED") return { ok: true, skipped: true, message: "الشغل مرحّل بالفعل" };
  if (run.status !== "DRAFT") throw new PostingError(`لا يمكن ترحيل شغل بحالة «${run.status}»`);

  const params = await getPayrollParams();
  const payslips = await db.payslip.findMany({ where: { payrollRunId: runId } });
  const gross = round2(
    payslips.reduce((a, ps) => a + ps.basic + ps.allowances + ps.overtime + ps.bonuses, 0)
  );
  const insSum = round2(payslips.reduce((a, ps) => a + ps.insurance, 0));
  const taxSum = round2(payslips.reduce((a, ps) => a + ps.tax, 0));
  const net = round2(gross - insSum - taxSum);
  const employerIns = round2(
    payslips.reduce((acc, ps) => {
      const g = ps.basic + ps.allowances + ps.overtime + ps.bonuses;
      return acc + (Math.min(g, params.insuranceCeiling) * params.employerInsuranceRate) / 100;
    }, 0)
  );
  const expenseTotal = round2(gross + employerIns);

  // حساب الراتب المستحق: 2110 إن وُجد، وإلا 2109 (مقاييس قديمة قبل إضافة 2110)
  const payableExists = await db.account.findUnique({ where: { code: PAYROLL_ACCOUNTS.salariesPayable } });
  const payableCode = payableExists ? PAYROLL_ACCOUNTS.salariesPayable : PAYROLL_ACCOUNTS.salariesPayableFallback;

  const date = new Date(run.periodYear, run.periodMonth - 1, 28);
  const entry = await postJournal({
    date,
    description: `رواتب ${run.periodMonth}/${run.periodYear} — ${run.payslips.length} موظفًا`,
    sourceType: "PAYROLL",
    sourceId: runId,
    companyId: run.companyId,
    createdBy: user,
    lines: [
      { accountCode: PAYROLL_ACCOUNTS.salariesExpense, debit: expenseTotal, description: `رواتب ${run.periodMonth}/${run.periodYear} (تشمل مساهمة صاحب العمل)` },
      { accountCode: PAYROLL_ACCOUNTS.insurancePayable, credit: round2(insSum + employerIns) },
      { accountCode: PAYROLL_ACCOUNTS.whtPayable, credit: taxSum },
      { accountCode: payableCode, credit: net },
    ].filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0),
  });

  await db.payrollRun.update({
    where: { id: runId },
    data: { status: "POSTED", journalEntryId: entry.id, totalGross: expenseTotal, totalDeductions: round2(insSum + taxSum), totalNet: net },
  });
  await appendEvent({
    action: "POST",
    entity: "PayrollRun",
    entityId: runId,
    actorType: "human",
    actor: user,
    summary: `ترحيل رواتب ${run.periodMonth}/${run.periodYear} — مصروف ${expenseTotal.toFixed(2)} (صافي ${net.toFixed(2)}) — قيد ${entry.number}`,
  });
  return { ok: true, journalNumber: entry.number, expenseTotal, net };
}

/** صرف الصافي من خزينة/بنك (بعد الترحيل) */
export async function payPayrollRun(runId: string, safeId: string, user: string = "system") {
  const run = await db.payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw new PostingError("شغل الرواتب غير موجود");
  if (run.status !== "POSTED") throw new PostingError("رحّل شغل الرواتب أولًا ثم سجّل الصرف");
  if (run.paidAt) return { ok: true, skipped: true, message: "الشغل مصروف بالفعل" };

  const safe = await db.safe.findUnique({ where: { id: safeId } });
  if (!safe) throw new PostingError("الخزينة/البنك غير موجود");
  if (!safe.accountId) throw new PostingError("الخزينة غير مرتبطة بحساب في دليل الحسابات — اربطها أولًا");

  const payableExists = await db.account.findUnique({ where: { code: PAYROLL_ACCOUNTS.salariesPayable } });
  const payableCode = payableExists ? PAYROLL_ACCOUNTS.salariesPayable : PAYROLL_ACCOUNTS.salariesPayableFallback;

  const safeAccount = await db.account.findUnique({ where: { id: safe.accountId } });
  const date = new Date();
  const entry = await postJournal({
    date,
    description: `صرف رواتب ${run.periodMonth}/${run.periodYear} من ${safe.name}`,
    sourceType: "PAYROLL_PAYMENT",
    sourceId: runId,
    companyId: run.companyId,
    createdBy: user,
    lines: [
      { accountCode: payableCode, debit: run.totalNet, description: `صرف رواتب ${run.periodMonth}/${run.periodYear}` },
      { accountCode: safeAccount!.code, credit: run.totalNet },
    ],
  });

  await db.payrollRun.update({ where: { id: runId }, data: { paidAt: date } });
  await appendEvent({
    action: "PAY",
    entity: "PayrollRun",
    entityId: runId,
    actorType: "human",
    actor: user,
    summary: `صرف رواتب ${run.periodMonth}/${run.periodYear} بمبلغ ${run.totalNet.toFixed(2)} من ${safe.name} — قيد ${entry.number}`,
  });
  return { ok: true, journalNumber: entry.number, paid: run.totalNet };
}

export async function getPayrollParams(): Promise<PayrollParams> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "payroll." } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const num = (k: string, d: number) => {
    const v = get(k);
    return v !== undefined && v !== null && !Number.isNaN(Number(v)) ? Number(v) : d;
  };
  let brackets = DEFAULT_PARAMS.whtBrackets;
  const raw = get(PARAM_KEYS.whtBrackets);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as WhtBracket[];
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((b) => b.upTo !== undefined && b.rate !== undefined)) {
        brackets = parsed.map((b, i, arr) => ({
          upTo: b.upTo === Infinity || i === arr.length - 1 ? Infinity : b.upTo,
          rate: b.rate,
        }));
      }
    } catch {
      // json فاسد — نتجه للمعياري
    }
  }
  return {
    insuranceRate: num(PARAM_KEYS.insuranceRate, DEFAULT_PARAMS.insuranceRate),
    employerInsuranceRate: num(PARAM_KEYS.employerInsuranceRate, DEFAULT_PARAMS.employerInsuranceRate),
    insuranceCeiling: num(PARAM_KEYS.insuranceCeiling, DEFAULT_PARAMS.insuranceCeiling),
    whtBrackets: brackets,
  };
}

export async function savePayrollParams(p: PayrollParams) {
  const brackets = p.whtBrackets.map((b) => ({ upTo: Number.isFinite(b.upTo) ? b.upTo : null, rate: b.rate }));
  await db.$transaction(
    (Object.entries(PARAM_KEYS) as [string, string][]).map(([field, key]) =>
      db.setting.upsert({
        where: { key },
        update: { value: String(field === "whtBrackets" ? JSON.stringify(brackets) : p[field]) },
        create: { key, value: String(field === "whtBrackets" ? JSON.stringify(brackets) : p[field]), group: "payroll" },
      })
    )
  );
}

