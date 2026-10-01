import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getOfficeBrand } from "@/lib/office-brand";
import { getPayrollParams } from "@/lib/payroll";
import { formatDate, formatMoney } from "@/lib/money";
import { AutoPrint } from "@/components/auto-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "بيان رواتب | دفاتر المحاسب" };

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** بيان رواتب شهري: مساهمات التأمينات (موظف/صاحب عمل) + ضريبة الدخل المقتطعة — لطباعة/إرفاق بالإقرار */
export default async function PayrollReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const [run, brand] = await Promise.all([
    db.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          orderBy: { id: "asc" },
          include: { employee: { select: { name: true, code: true, insuranceNumber: true } } },
        },
      },
    }),
    getOfficeBrand(),
  ]);
  if (!run) redirect("/payroll");

  const company = await db.clientCompany.findUnique({ where: { id: run.companyId } });
  const params = await getPayrollParams();
  const now = new Date();
  const monthYear = `${MONTHS[run.periodMonth - 1]} ${run.periodYear}`;

  type Row = {
    name: string;
    insuranceNo: string | null;
    gross: number;
    insurance: number;
    employerInsurance: number;
    taxable: number;
    tax: number;
  };
  const rows: Row[] = run.payslips.map((p) => {
    const gross = p.basic + p.allowances + p.overtime + p.bonuses;
    return {
      name: p.employee?.name ?? "—",
      insuranceNo: p.employee?.insuranceNumber ?? null,
      gross,
      insurance: p.insurance,
      employerInsurance: p.employerInsurance,
      taxable: Math.max(0, gross - p.insurance),
      tax: p.tax,
    };
  });

  const t = rows.reduce(
    (a, r) => ({
      gross: a.gross + r.gross,
      insurance: a.insurance + r.insurance,
      employer: a.employer + r.employerInsurance,
      taxable: a.taxable + r.taxable,
      tax: a.tax + r.tax,
    }),
    { gross: 0, insurance: 0, employer: 0, taxable: 0, tax: 0 }
  );

  const pct = (v: number) => `${(Number.isInteger(v) ? v : v.toFixed(1))}%`;

  return (
    <div className="print-page">
      <div className="print-doc print-report" dir="rtl">
        <header className="print-doc-head">
          <div className="print-doc-brand">
            <div className="print-doc-brand-name" style={{ color: brand.primary }}>{brand.name}</div>
            <div className="print-doc-brand-sub">{brand.subtitle}</div>
          </div>
          <div className="print-doc-title">بيان مساهمات التأمينات والضريبة على الرواتب</div>
        </header>

        <div className="print-doc-meta">
          <div className="print-doc-meta-item">
            <span>الجهة:</span>
            <b>{company?.name ?? "—"}</b>
          </div>
          {company?.taxNumber && (
            <div className="print-doc-meta-item">
              <span>الرقم الضريبي:</span>
              <b dir="ltr">{company.taxNumber}</b>
            </div>
          )}
          <div className="print-doc-meta-item">
            <span>الشهر:</span>
            <b>{monthYear}</b>
          </div>
          <div className="print-doc-meta-item">
            <span>عدد الموظفين:</span>
            <b>{rows.length}</b>
          </div>
        </div>

        <h2>أولًا — التأمينات الاجتماعية (نسبة الموظف {pct(params.insuranceRate)} — نسبة صاحب العمل {pct(params.employerInsuranceRate)})</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>الموظف</th>
              <th style={{ width: 130 }}>رقم التأمينات</th>
              <th className="num">الأجر التأميني</th>
              <th className="num">مساهمة الموظف</th>
              <th className="num">مساهمة صاحب العمل</th>
              <th className="num">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="num muted">{i + 1}</td>
                <td>{r.name}</td>
                <td className="num" dir="ltr">{r.insuranceNo ?? "—"}</td>
                <td className="num">{formatMoney(r.gross)}</td>
                <td className="num">{formatMoney(r.insurance)}</td>
                <td className="num">{formatMoney(r.employerInsurance)}</td>
                <td className="num">{formatMoney(r.insurance + r.employerInsurance)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 18, color: "#888" }}>لا توجد قسائم</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, borderTop: "2px solid #111" }}>
              <td colSpan={4}>الإجمالي</td>
              <td className="num">{formatMoney(t.insurance)}</td>
              <td className="num">{formatMoney(t.employer)}</td>
              <td className="num">{formatMoney(t.insurance + t.employer)}</td>
            </tr>
          </tfoot>
        </table>

        <h2>ثانيًا — ضريبة الدخل المقتطعة من الرواتب</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>#</th>
              <th>الموظف</th>
              <th className="num">الصافي الخاضع (بعد التأمين)</th>
              <th className="num">الضريبة المقتطعة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="num muted">{i + 1}</td>
                <td>{r.name}</td>
                <td className="num">{formatMoney(r.taxable)}</td>
                <td className="num">{formatMoney(r.tax)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, borderTop: "2px solid #111" }}>
              <td colSpan={3}>الإجمالي</td>
              <td className="num">{formatMoney(t.tax)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="section-label" style={{ marginTop: 10 }}>معدلات ضريبة الدخل الشهرية المطبقة:</div>
        <table style={{ maxWidth: 420 }}>
            <thead>
              <tr>
                <th className="num">من</th>
                <th className="num">إلى</th>
                <th className="num">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {params.whtBrackets.map((b, i) => {
                const from = i === 0 ? 0 : params.whtBrackets[i - 1].upTo;
                const to = Number.isFinite(b.upTo) ? b.upTo : null;
                return (
                  <tr key={i}>
                    <td className="num">{formatMoney(from)}</td>
                    <td className="num">{to !== null ? formatMoney(to) : "فوق"}</td>
                    <td className="num">{pct(b.rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

        <div className="print-doc-sigs">
          <div className="sig">
            إعداد: المحاسب القانوني
            <div className="sig-line" />
          </div>
          <div className="sig">
            الختم والتوقيع
            <div className="sig-line" />
          </div>
        </div>

        <p className="print-doc-foot">
          صدر آليًا من {brand.name} بتاريخ {formatDate(now)} — {monthYear} — إجمالي مساهمات التأمينات {formatMoney(t.insurance + t.employer)} — إجمالي الضريبة المقتطعة {formatMoney(t.tax)}
        </p>
      </div>
      <AutoPrint />
    </div>
  );
}
