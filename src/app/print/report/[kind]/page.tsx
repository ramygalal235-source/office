import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { getOfficeBrand } from "@/lib/office-brand";
import { getFinancialStatement, getPartyBalances, getTrialBalance } from "@/lib/accounting/ledger";
import { formatDate, formatMoney, round2, sumMoney } from "@/lib/money";
import { AutoPrint } from "@/components/auto-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "طباعة تقرير | دفاتر المحاسب" };

type Kind = "trial" | "statements" | "receivables" | "vat" | "assets";
const KINDS: Kind[] = ["trial", "statements", "receivables", "vat", "assets"];
const TITLES: Record<Kind, string> = {
  trial: "ميزان المراجعة",
  statements: "القوائم المالية",
  receivables: "ذمم العملاء والموردين",
  vat: "ملخص ضريبة القيمة المضافة",
  assets: "سجل الأصول الثابتة والإهلاك",
};

function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1);
}

export default async function PrintReportPage({ params }: { params: Promise<{ kind: string }> }) {
  const session = await getSession();
  if (!session) redirect("/reports");
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) redirect("/reports");
  const k = kind as Kind;

  const now = new Date();
  const from = startOfYear();
  const period = `سنة ${now.getFullYear()} — من ${formatDate(from)} إلى ${formatDate(now)}`;
  const [brand, companyId] = await Promise.all([getOfficeBrand(), requireCompanyId()]);

  return (
    <div className="print-page">
      <div className="print-doc print-report">
        <div className="print-doc-head">
          <div className="print-doc-brand">
            <div className="print-doc-brand-name" style={{ color: brand.primary }}>
              {brand.name}
            </div>
            <div className="print-doc-brand-sub">{brand.subtitle}</div>
          </div>
          <div className="print-doc-title">{TITLES[k]}</div>
        </div>
        <p style={{ fontSize: 11, color: "#555", margin: "0 0 14px" }}>{period}</p>

        {k === "trial" && <TrialSection from={from} to={now} companyId={companyId} />}
        {k === "statements" && <StatementsSection from={from} to={now} companyId={companyId} />}
        {k === "receivables" && <ReceivablesSection companyId={companyId} />}
        {k === "vat" && <VatSection from={from} to={now} companyId={companyId} />}
        {k === "assets" && <AssetsSection companyId={companyId} />}

        <p className="print-doc-foot">
          صدر هذا التقرير آليًا من {brand.name} بتاريخ {formatDate(now)}
        </p>
      </div>
      <AutoPrint />
    </div>
  );
}

async function TrialSection({ from, to, companyId }: { from: Date; to: Date; companyId: string }) {
  const trial = await getTrialBalance({ from, to }, companyId);
  return (
    <section>
      <h2>{TITLES.trial} {trial.balanced ? "— متوازن" : `— فرق ${formatMoney(trial.balanced)}`}</h2>
      <table>
        <thead>
          <tr>
            <th style={{ width: 90 }}>الكود</th>
            <th>الحساب</th>
            <th>مدين</th>
            <th>دائن</th>
          </tr>
        </thead>
        <tbody>
          {trial.rows.map((r) => (
            <tr key={r.code} style={r.isGroup ? { background: "#f7f7f7", fontWeight: 700 } : undefined}>
              <td className="num" style={{ fontSize: 10, color: "#666" }}>
                {r.code}
              </td>
              <td style={{ paddingInlineStart: `${8 + (r.level - 1) * 14}px` }}>{r.name}</td>
              <td className="num">{r.debit ? formatMoney(r.debit) : "—"}</td>
              <td className="num">{r.credit ? formatMoney(r.credit) : "—"}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 800, borderTop: "2px solid #111" }}>
            <td colSpan={2} style={{ textAlign: "end" }}>
              الإجمالي
            </td>
            <td className="num">{formatMoney(trial.totalDebit)}</td>
            <td className="num">{formatMoney(trial.totalCredit)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

async function StatementsSection({ from, to, companyId }: { from: Date; to: Date; companyId: string }) {
  const s = await getFinancialStatement({ from, to }, companyId);
  return (
    <section>
      <h2>قائمة الدخل</h2>
      <div className="kv">
        <span>إيرادات المبيعات</span>
        <b>{formatMoney(s.totalRevenue)}</b>
      </div>
      <div className="kv">
        <span>تكلفة البضاعة المباعة</span>
        <b>{formatMoney(-s.costOfGoods)}</b>
      </div>
      <div className="kv">
        <span>مجمل الربح</span>
        <b>{formatMoney(s.grossProfit)}</b>
      </div>
      <div className="kv">
        <span>المصروفات التشغيلية</span>
        <b>{formatMoney(-s.operatingExpenses)}</b>
      </div>
      <div className="kv total-line">
        <span>صافي الربح</span>
        <b>{formatMoney(s.netProfit)}</b>
      </div>

      <h2 style={{ marginTop: 18 }}>قائمة المركز المالي (مختصر)</h2>
      <div className="section-label">الأصول</div>
      <div className="kv">
        <span>أصول متداولة</span>
        <b>{formatMoney(s.assets.current)}</b>
      </div>
      <div className="kv">
        <span>أصول ثابتة</span>
        <b>{formatMoney(s.assets.fixed)}</b>
      </div>
      <div className="kv">
        <span>إجمالي الأصول</span>
        <b>{formatMoney(s.assets.total)}</b>
      </div>
      <div className="section-label">الخصوم وحقوق الملكية</div>
      <div className="kv">
        <span>التزامات متداولة</span>
        <b>{formatMoney(s.liabilities.current)}</b>
      </div>
      <div className="kv">
        <span>إجمالي الالتزامات</span>
        <b>{formatMoney(s.liabilities.total)}</b>
      </div>
      <div className="kv">
        <span>حقوق الملكية</span>
        <b>{formatMoney(s.equity)}</b>
      </div>
      <div className="kv total-line">
        <span>إجمالي الخصوم وحقوق الملكية</span>
        <b>{formatMoney(round2(s.liabilities.total + s.equity))}</b>
      </div>
    </section>
  );
}

async function ReceivablesSection({ companyId }: { companyId: string }) {
  const [customers, suppliers] = await Promise.all([getPartyBalances("CUSTOMER", companyId), getPartyBalances("SUPPLIER", companyId)]);
  const render = (title: string, rows: { partyId: string; name: string; invoiceTotal: number; paid: number; balance: number }[]) => {
    const total = sumMoney(rows.map((r) => r.balance));
    return (
      <div style={{ marginBottom: 18 }}>
        <h2>{title}</h2>
        {rows.length === 0 ? (
          <p style={{ fontSize: 11, color: "#777" }}>لا توجد أرصدة</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>الطرف</th>
                <th>إجمالي</th>
                <th>سدد</th>
                <th>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partyId}>
                  <td>{r.name}</td>
                  <td className="num">{formatMoney(r.invoiceTotal)}</td>
                  <td className="num">{formatMoney(r.paid)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {formatMoney(r.balance)}
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, borderTop: "2px solid #111" }}>
                <td colSpan={3} style={{ textAlign: "end" }}>
                  الإجمالي
                </td>
                <td className="num">{formatMoney(total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    );
  };
  return <section>{render("ذمم العملاء", customers)}{render("ذمم الموردين", suppliers)}</section>;
}

async function VatSection({ from, to, companyId }: { from: Date; to: Date; companyId: string }) {
  const vat = await db.invoice.aggregate({
    where: { companyId, date: { gte: from, lte: to }, status: { notIn: ["DRAFT", "CANCELLED"] } },
    _sum: { subtotal: true, discount: true, taxAmount: true },
  });
  const outputVat = round2(vat._sum.taxAmount ?? 0);
  const netSales = round2((vat._sum.subtotal ?? 0) - (vat._sum.discount ?? 0));
  const inputVat = round2(
    (
      await db.journalLine.aggregate({
        where: { account: { code: "1108" }, journalEntry: { companyId, status: "POSTED", date: { gte: from, lte: to } } },
        _sum: { debit: true },
      })
    )._sum.debit ?? 0
  );
  const netVat = round2(outputVat - inputVat);

  return (
    <section>
      <h2>ملخص ضريبة القيمة المضافة</h2>
      <div className="kv">
        <span>صافي المبيعات الخاضعة للضريبة</span>
        <b>{formatMoney(netSales)}</b>
      </div>
      <div className="kv">
        <span>ضريبة المخرجات (على المبيعات)</span>
        <b>{formatMoney(outputVat)}</b>
      </div>
      <div className="kv">
        <span>ضريبة المدخلات (على المشتريات)</span>
        <b>{formatMoney(-inputVat)}</b>
      </div>
      <div className="kv total-line">
        <span>صافي الضريبة المستحقة</span>
        <b>{formatMoney(netVat)}</b>
      </div>
      <p style={{ fontSize: 10, color: "#777", marginTop: 10 }}>
        الأرقام محسوبة من الفواتير والقيود المرحّلة فقط. الإقرار الضريبي الفعلي يعتمد على تسويات نهاية
        الفترة التي تُدخل كقيود يدوية في دفتر اليومية.
      </p>
    </section>
  );
}

async function AssetsSection({ companyId }: { companyId: string }) {
  const assets = await db.fixedAsset.findMany({
    where: { companyId },
    include: { account: { select: { code: true, name: true } }, depreciations: { select: { periodYear: true, periodMonth: true, amount: true } } },
    orderBy: { code: "asc" },
  });
  if (assets.length === 0) {
    return <p style={{ fontSize: 12, color: "#555" }}>لا توجد أصول مسجلة.</p>;
  }
  const sum = (f: (a: (typeof assets)[number]) => number) => assets.reduce((x, a) => x + f(a), 0);
  return (
    <table>
      <thead>
        <tr>
          <th>الرمز</th>
          <th>الأصل</th>
          <th>الحساب</th>
          <th>التكلفة</th>
          <th>المجمع</th>
          <th>القيمة الدفترية</th>
          <th>إهلاك السنة</th>
          <th>الحالة</th>
        </tr>
      </thead>
      <tbody>
        {assets.map((a) => {
          const yearDep = a.depreciations
            .filter((d) => d.periodYear === new Date().getFullYear())
            .reduce((x, d) => x + d.amount, 0);
          return (
            <tr key={a.id}>
              <td>{a.code}</td>
              <td>{a.name}</td>
              <td>{a.account ? a.account.code : "—"}</td>
              <td className="num">{formatMoney(a.cost)}</td>
              <td className="num">{formatMoney(a.accumulatedDepreciation)}</td>
              <td className="num">{formatMoney(round2(a.cost - a.accumulatedDepreciation))}</td>
              <td className="num">{formatMoney(round2(yearDep))}</td>
              <td>{a.status === "ACTIVE" ? "نشط" : "مُصرَّف"}</td>
            </tr>
          );
        })}
        <tr style={{ fontWeight: 700 }}>
          <td colSpan={3}>الإجمالي</td>
          <td className="num">{formatMoney(sum((a) => a.cost))}</td>
          <td className="num">{formatMoney(sum((a) => a.accumulatedDepreciation))}</td>
          <td className="num">{formatMoney(sum((a) => a.cost - a.accumulatedDepreciation))}</td>
          <td className="num">{formatMoney(sum((a) => a.depreciations.filter((d) => d.periodYear === new Date().getFullYear()).reduce((x, d) => x + d.amount, 0)))}</td>
          <td>{`${assets.filter((a) => a.status === "ACTIVE").length} نشط`}</td>
        </tr>
      </tbody>
    </table>
  );
}
