import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOfficeBrand } from "@/lib/office-brand";
import { formatMoney } from "@/lib/money";
import { AutoPrint } from "@/components/auto-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "طباعة قسائم الرواتب | دفاتر المحاسب" };

export default async function PrintPayslipsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const [run, brand] = await Promise.all([
    db.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          include: {
            employee: { select: { name: true, code: true, jobTitle: true, department: true, bankName: true, bankAccount: true } },
          },
        },
      },
    }),
    getOfficeBrand(),
  ]);
  if (!run) redirect("/payroll");

  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  return (
    <div className="print-page">
      <div className="print-doc print-payslips" dir="rtl">
        <header className="print-doc-head">
          <div className="print-doc-brand">
            <div className="print-doc-brand-name" style={{ color: brand.primary }}>{brand.name}</div>
            <div className="print-doc-brand-sub">{brand.subtitle}</div>
          </div>
          <div className="print-doc-title">قسائم رواتب — {MONTHS[run.periodMonth - 1]} {run.periodYear}</div>
        </header>

        {run.payslips.map((ps) => {
          const gross = ps.basic + ps.allowances + ps.overtime + ps.bonuses;
          return (
            <section key={ps.id} className="payslip-card">
              <div className="payslip-head">
                <div>
                  <b className="payslip-emp">{ps.employee.name}</b>
                  <span className="payslip-meta">
                    {ps.employee.code}
                    {ps.employee.jobTitle ? ` • ${ps.employee.jobTitle}` : ""}
                    {ps.employee.department ? ` • ${ps.employee.department}` : ""}
                  </span>
                </div>
                <div className="payslip-net">
                  <span>الصافي المستحق</span>
                  <b>{formatMoney(ps.net)}</b>
                </div>
              </div>
              <table className="payslip-table">
                <tbody>
                  <tr><td>الراتب الأساسي</td><td className="num">{formatMoney(ps.basic)}</td></tr>
                  {ps.allowances > 0 && <tr><td>المستحقات (سكن/مواصلات/أخرى)</td><td className="num">{formatMoney(ps.allowances)}</td></tr>}
                  {ps.overtime > 0 && <tr><td>ساعات إضافية</td><td className="num">{formatMoney(ps.overtime)}</td></tr>}
                  {ps.bonuses > 0 && <tr><td>مكافآت</td><td className="num">{formatMoney(ps.bonuses)}</td></tr>}
                  <tr className="subtotal"><td>الإجمالي</td><td className="num">{formatMoney(gross)}</td></tr>
                  <tr><td>تأمينات اجتماعية</td><td className="num">({formatMoney(ps.insurance)})</td></tr>
                  {ps.tax > 0 && <tr><td>ضريبة دخل العمالة</td><td className="num">({formatMoney(ps.tax)})</td></tr>}
                  {ps.otherDeductions > 0 && <tr><td>خصومات أخرى</td><td className="num">({formatMoney(ps.otherDeductions)})</td></tr>}
                  <tr className="net"><td>الصافي</td><td className="num">{formatMoney(ps.net)}</td></tr>
                </tbody>
              </table>
              <div className="payslip-foot">
                <span>
                  {ps.employee.bankName
                    ? `تحويل بنكي: ${ps.employee.bankName}${ps.employee.bankAccount ? ` — ${ps.employee.bankAccount}` : ""}`
                    : "صرف نقدي"}
                </span>
                <span>
                  <i>توقيع المستلم</i>
                </span>
                <span>
                  <i>توقيع المحاسب</i>
                </span>
              </div>
            </section>
          );
        })}

        <p className="print-doc-foot">
          صدر آليًا من {brand.name} — إجمالي الصافي {formatMoney(run.totalNet)} — {run.payslips.length} موظفًا
        </p>
      </div>
      <AutoPrint />
    </div>
  );
}
