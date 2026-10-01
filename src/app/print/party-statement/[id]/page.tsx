import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOfficeBrand } from "@/lib/office-brand";
import { getPartyStatement } from "@/lib/accounting/ledger";
import { formatDate, formatMoney } from "@/lib/money";
import { AutoPrint } from "@/components/auto-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "كشف حساب | دفاتر المحاسب" };

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function parseDate(v: string | string[] | undefined, fallback: Date): Date {
  const s = Array.isArray(v) ? v[0] : v;
  if (s) {
    const d = new Date(`${s}T00:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return fallback;
}

/** كشف حساب عميل/مورد: رصيد سابق + كل الحركات (من سطور اليومية) + رصيد ختامي */
export default async function PartyStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;

  const now = new Date();
  const from = parseDate(sp.from, new Date(now.getFullYear(), 0, 1));
  const to = parseDate(sp.to, now);

  const [stmt, brand] = await Promise.all([
    getPartyStatement(id, { from, to }),
    getOfficeBrand(),
  ]);
  if (!stmt) redirect("/parties");

  const { party, opening, rows, totals } = stmt;
  const isCustomer = party.type === "CUSTOMER";
  const balanceSideLabel = isCustomer ? "مدين" : "دائن";
  const monthYear = `${MONTHS[to.getMonth()]} ${to.getFullYear()}`;

  return (
    <div className="print-page">
      <div className="print-doc print-report" dir="rtl">
        <header className="print-doc-head">
          <div className="print-doc-brand">
            <div className="print-doc-brand-name" style={{ color: brand.primary }}>{brand.name}</div>
            <div className="print-doc-brand-sub">{brand.subtitle}</div>
          </div>
          <div className="print-doc-title">كشف حساب {isCustomer ? "عميل" : "مورد"} — {party.name}</div>
        </header>

        <div className="print-doc-meta">
          <div className="print-doc-meta-item">
            <span>الطرف:</span>
            <b>{party.name}</b>
          </div>
          <div className="print-doc-meta-item">
            <span>الكود:</span>
            <b dir="ltr">{party.code}</b>
          </div>
          {party.taxNumber && (
            <div className="print-doc-meta-item">
              <span>الرقم الضريبي:</span>
              <b dir="ltr">{party.taxNumber}</b>
            </div>
          )}
          <div className="print-doc-meta-item">
            <span>الفترة:</span>
            <b>من {formatDate(from)} إلى {formatDate(to)}</b>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>التاريخ</th>
              <th style={{ width: 110 }}>المستند</th>
              <th>البيان</th>
              <th className="num">مدين</th>
              <th className="num">دائن</th>
              <th className="num">الرصيد ({balanceSideLabel})</th>
            </tr>
          </thead>
          <tbody>
            {opening !== 0 && (
              <tr>
                <td className="muted">—</td>
                <td className="muted">رصيد سابق</td>
                <td>الرصيد حتى {formatDate(from)}</td>
                <td className="num" />
                <td className="num" />
                <td className="num">{formatMoney(opening)}</td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="num" style={{ fontSize: 11 }}>{formatDate(r.date)}</td>
                <td style={{ fontSize: 11 }} dir="ltr">{r.entryNumber}</td>
                <td>{r.description}</td>
                <td className="num">{r.debit ? formatMoney(r.debit) : ""}</td>
                <td className="num">{r.credit ? formatMoney(r.credit) : ""}</td>
                <td className="num">{formatMoney(r.balance)}</td>
              </tr>
            ))}
            {rows.length === 0 && opening === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 18, color: "#888" }}>
                  لا توجد حركات في هذه الفترة
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, borderTop: "2px solid #111" }}>
              <td colSpan={3}>الإجمالي — الفترة</td>
              <td className="num">{formatMoney(totals.debit)}</td>
              <td className="num">{formatMoney(totals.credit)}</td>
              <td className="num">{formatMoney(totals.closing)}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40, fontSize: 12 }}>
          <span>
            <i>توقيع المحاسب</i>
          </span>
          <span>
            <i>{isCustomer ? "استلام العميل" : "توقيع المورد"}</i>
          </span>
        </div>

        <p className="print-doc-foot">
          صدر آليًا من {brand.name} بتاريخ {formatDate(now)} — {monthYear} — الرصيد الختامي {formatMoney(totals.closing)} ({balanceSideLabel})
        </p>
      </div>
      <AutoPrint />
    </div>
  );
}
