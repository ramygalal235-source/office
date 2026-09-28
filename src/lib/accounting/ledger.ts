import { db } from "@/lib/db";
import { round2, sumMoney } from "@/lib/money";
import { ACCOUNT_NATURE } from "./constants";

// ===== محرك الحسابات =====
// كل الأرصدة هنا تُشتق من قيود اليومية المرحّلة فقط (status = POSTED)،
// فأي مسودة أو قيد معكوس لا يؤثر على الأرقام.

export interface Period {
  from?: Date;
  to?: Date;
}

export interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: string;
  level: number;
  isGroup: boolean;
  parentId: string | null;
  debit: number; // مجموع المدين
  credit: number; // مجموع الدائن
  balance: number; // الرصيد بطبيعة الحساب
  opening: number;
  periodDebit: number;
  periodCredit: number;
}

function dateFilter(period: Period) {
  if (!period.from && !period.to) return undefined;
  return {
    ...(period.from ? { gte: period.from } : {}),
    ...(period.to ? { lte: period.to } : {}),
  };
}

/** أرصدة كل الحسابات (غير مجمّعة) عن فترة، مع الرصيد الافتتاحي */
export async function getAccountBalances(period: Period = {}): Promise<AccountBalance[]> {
  const entriesWhere = {
    status: "POSTED",
    date: dateFilter(period),
  };

  const [accounts, inPeriod, before] = await Promise.all([
    db.account.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, type: true, level: true, isGroup: true, parentId: true },
      orderBy: { code: "asc" },
    }),
    period.from || period.to
      ? db.journalLine.groupBy({
          by: ["accountId"],
          where: { journalEntry: entriesWhere },
          _sum: { debit: true, credit: true },
        })
      : Promise.resolve([]),
    period.from
      ? db.journalLine.groupBy({
          by: ["accountId"],
          where: { journalEntry: { status: "POSTED", date: { lt: period.from } } },
          _sum: { debit: true, credit: true },
        })
      : Promise.resolve([]),
  ]);

  const debitMap = new Map<string, number>();
  const creditMap = new Map<string, number>();
  for (const row of inPeriod) {
    debitMap.set(row.accountId, row._sum.debit ?? 0);
    creditMap.set(row.accountId, row._sum.credit ?? 0);
  }
  const openDebit = new Map<string, number>();
  const openCredit = new Map<string, number>();
  for (const row of before) {
    openDebit.set(row.accountId, row._sum.debit ?? 0);
    openCredit.set(row.accountId, row._sum.credit ?? 0);
  }

  return accounts.map((acc) => {
    const periodDebit = round2(debitMap.get(acc.id) ?? 0);
    const periodCredit = round2(creditMap.get(acc.id) ?? 0);
    const openingRaw = round2((openDebit.get(acc.id) ?? 0) - (openCredit.get(acc.id) ?? 0));
    const nature = ACCOUNT_NATURE[acc.type] ?? "DEBIT";
    const opening = nature === "DEBIT" ? openingRaw : -openingRaw;
    const raw = periodDebit - periodCredit;
    return {
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      level: acc.level,
      isGroup: acc.isGroup,
      parentId: acc.parentId,
      debit: periodDebit,
      credit: periodCredit,
      opening,
      periodDebit,
      periodCredit,
      balance: nature === "DEBIT" ? opening + raw : -(opening + raw),
    };
  });
}

/** يجمع أرصدة الأبناء في الآباء (ترجيحي) لإظهار المجاميع في التقارير */
export function rollUp(balances: AccountBalance[]): AccountBalance[] {
  const byId = new Map(balances.map((b) => [b.accountId, { ...b }]));
  const childrenOf = new Map<string, string[]>();
  for (const b of balances) {
    if (!b.parentId) continue;
    const list = childrenOf.get(b.parentId) ?? [];
    list.push(b.accountId);
    childrenOf.set(b.parentId, list);
  }

  // نبدأ من الأعمق للأعلى حتى تصل المجاميع للأبوين
  const depthOf = (b: AccountBalance): number => {
    let d = 0;
    let cur = b;
    while (cur.parentId) {
      d += 1;
      const parent = byId.get(cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    return d;
  };

  const ordered = [...balances].sort((a, b) => depthOf(b) - depthOf(a));
  for (const b of ordered) {
    const children = childrenOf.get(b.accountId) ?? [];
    if (!children.length) continue;
    const rows = children.map((c) => byId.get(c)).filter(Boolean) as AccountBalance[];
    b.debit = sumMoney(rows.map((r) => r.debit));
    b.credit = sumMoney(rows.map((r) => r.credit));
    b.opening = sumMoney(rows.map((r) => r.opening));
    b.balance = sumMoney(rows.map((r) => r.balance));
    b.periodDebit = b.debit;
    b.periodCredit = b.credit;
  }
  return balances;
}

// ===== ميزان المراجعة =====

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: string;
  level: number;
  debit: number;
  credit: number;
  isGroup: boolean;
}

export async function getTrialBalance(period: Period = {}) {
  const balances = await getAccountBalances(period);
  const rows: TrialBalanceRow[] = balances
    .filter((b) => !b.isGroup || b.debit !== 0 || b.credit !== 0)
    .map((b) => ({
      code: b.code,
      name: b.name,
      type: b.type,
      level: b.level,
      // الرصيد يعرض في جانبه حسب طبيعة الحساب (مدين أو دائن)
      debit: b.balance > 0 ? b.balance : 0,
      credit: b.balance < 0 ? Math.abs(b.balance) : 0,
      isGroup: b.isGroup,
    }));

  const totalDebit = sumMoney(rows.map((r) => r.debit));
  const totalCredit = sumMoney(rows.map((r) => r.credit));

  return { rows, totalDebit, totalCredit, balanced: round2(totalDebit - totalCredit) === 0 };
}

// ===== كشف حساب =====

export interface LedgerRow {
  date: Date;
  entryNumber: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
}

export async function getAccountLedger(accountId: string, period: Period = {}): Promise<LedgerRow[]> {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, code: true, type: true },
  });
  if (!account) return [];

  const nature = ACCOUNT_NATURE[account.type] ?? "DEBIT";

  const [lines, openingAgg] = await Promise.all([
    db.journalLine.findMany({
      where: {
        accountId,
        journalEntry: { status: "POSTED", date: dateFilter(period) },
      },
      include: { journalEntry: { select: { number: true, date: true, description: true, sourceType: true, sourceId: true } } },
      orderBy: [{ journalEntry: { date: "asc" } }, { sortOrder: "asc" }],
    }),
    period.from
      ? db.journalLine.aggregate({
          where: { accountId, journalEntry: { status: "POSTED", date: { lt: period.from } } },
          _sum: { debit: true, credit: true },
        })
      : Promise.resolve({ _sum: { debit: null, credit: null } }),
  ]);

  const rawOpening = round2((openingAgg._sum.debit ?? 0) - (openingAgg._sum.credit ?? 0));
  let running = nature === "DEBIT" ? rawOpening : -rawOpening;

  const rows: LedgerRow[] = lines.map((line) => {
    running = nature === "DEBIT" ? running + line.debit - line.credit : running - line.debit + line.credit;
    return {
      date: line.journalEntry.date,
      entryNumber: line.journalEntry.number,
      description: line.description || line.journalEntry.description,
      reference: line.journalEntry.sourceType ?? "",
      debit: line.debit,
      credit: line.credit,
      balance: round2(running),
    };
  });

  return rows;
}

// ===== القوائم المالية =====

export interface FinancialStatement {
  revenue: number;
  otherIncome: number;
  totalRevenue: number;
  costOfGoods: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  assets: {
    current: number;
    fixed: number;
    total: number;
  };
  liabilities: {
    current: number;
    total: number;
  };
  equity: number;
}

export async function getFinancialStatement(period: Period = {}): Promise<FinancialStatement> {
  const balances = await getAccountBalances(period);
  const leaf = balances.filter((b) => !b.isGroup);
  const total = (types: string[], pick?: (b: AccountBalance) => number) =>
    sumMoney(leaf.filter((b) => types.includes(b.type)).map((b) => (pick ? pick(b) : Math.abs(b.balance))));

  const assetsTotal = total(["ASSET"]);
  const liabilitiesTotal = total(["LIABILITY"]);
  const equityTotal = total(["EQUITY"]);

  const fixedCodes = ["12"];
  const currentAssets = sumMoney(
    leaf.filter((b) => b.type === "ASSET" && !b.code.startsWith(fixedCodes)).map((b) => Math.abs(b.balance))
  );
  const fixedAssets = sumMoney(
    leaf.filter((b) => b.type === "ASSET" && b.code.startsWith(fixedCodes)).map((b) => Math.abs(b.balance))
  );

  const currentLiabilities = sumMoney(
    leaf
      .filter((b) => b.type === "LIABILITY" && b.code.startsWith("21"))
      .map((b) => Math.abs(b.balance))
  );

  const revenue = total(["INCOME"]);
  const expenses = total(["EXPENSE"]);
  const cogs = sumMoney(
    leaf
      .filter((b) => b.type === "EXPENSE" && b.code.startsWith("51"))
      .map((b) => Math.abs(b.balance))
  );

  return {
    revenue,
    otherIncome: 0,
    totalRevenue: revenue,
    costOfGoods: cogs,
    grossProfit: round2(revenue - cogs),
    operatingExpenses: round2(expenses - cogs),
    netProfit: round2(revenue - expenses),
    assets: { current: currentAssets, fixed: fixedAssets, total: assetsTotal },
    liabilities: { current: currentLiabilities, total: liabilitiesTotal },
    equity: equityTotal,
  };
}

// ===== أرصدة أطراف الحساب =====

export interface PartyBalance {
  partyId: string;
  name: string;
  type: string;
  invoiceTotal: number;
  paid: number;
  balance: number;
}

export async function getPartyBalances(type: "CUSTOMER" | "SUPPLIER" = "CUSTOMER"): Promise<PartyBalance[]> {
  const [parties, invoices, purchases, payments] = await Promise.all([
    db.party.findMany({ where: { type, isActive: true }, orderBy: { name: "asc" } }),
    db.invoice.groupBy({
      by: ["customerId"],
      where: { customerId: { not: null }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true },
    }),
    db.purchase.groupBy({
      by: ["supplierId"],
      where: { supplierId: { not: null }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true },
    }),
    db.payment.groupBy({
      by: ["partyId"],
      where: {
        partyId: { not: null },
        type: type === "CUSTOMER" ? "IN" : "OUT",
      },
      _sum: { amount: true },
    }),
  ]);

  const invoiceMap = new Map<string, number>();
  for (const i of invoices) if (i.customerId) invoiceMap.set(i.customerId, i._sum.totalAmount ?? 0);
  const purchaseMap = new Map<string, number>();
  for (const p of purchases) if (p.supplierId) purchaseMap.set(p.supplierId, p._sum.totalAmount ?? 0);
  const paidMap = new Map<string, number>();
  for (const p of payments) if (p.partyId) paidMap.set(p.partyId, p._sum.amount ?? 0);

  return parties.map((party) => {
    const invoiceTotal = type === "CUSTOMER"
      ? round2(invoiceMap.get(party.id) ?? 0)
      : round2(purchaseMap.get(party.id) ?? 0);
    const paid = round2(paidMap.get(party.id) ?? 0);
    return {
      partyId: party.id,
      name: party.name,
      type: party.type,
      invoiceTotal,
      paid,
      balance: round2(invoiceTotal - paid),
    };
  });
}

// ===== رصيد الخزائن =====

export async function getSafeBalances() {
  const safes = await db.safe.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  if (!safes.length) return [];

  const grouped = await db.payment.groupBy({
    by: ["safeId"],
    where: { safeId: { not: null } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const inAgg = await db.payment.groupBy({
    by: ["safeId"],
    where: { safeId: { not: null }, type: "IN" },
    _sum: { amount: true },
  });
  const outAgg = await db.payment.groupBy({
    by: ["safeId"],
    where: { safeId: { not: null }, type: "OUT" },
    _sum: { amount: true },
  });

  const pick = (arr: typeof grouped, id: string) => arr.find((x) => x.safeId === id);

  return safes.map((safe) => {
    const total = pick(grouped, safe.id)?._sum.amount ?? 0;
    const inSum = pick(inAgg, safe.id)?._sum.amount ?? 0;
    const outSum = pick(outAgg, safe.id)?._sum.amount ?? 0;
    return {
      id: safe.id,
      code: safe.code,
      name: safe.name,
      type: safe.type,
      openingBalance: safe.openingBalance,
      totalIn: round2(inSum),
      totalOut: round2(outSum),
      balance: round2(safe.openingBalance + inSum - outSum),
      movementCount: pick(grouped, safe.id)?._count._all ?? 0,
    };
  });
}
