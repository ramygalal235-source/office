// ===== وثيقة الطباعة: ترويسة + بيانات + أسطر + إجماليات + توقيعات =====
// مكوّن خادم يولّد نسخة A4 نظيفة — النص حقيقي قابل للنسخ والاختيار
// (لا صور) حتى تعمل الطباعة وحفظ PDF دون فقدان شكل العربية.
import { formatMoney, formatDate, round2 } from "@/lib/money";
import type { OfficeBrand } from "@/lib/office-brand";

export interface PrintLine {
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  lineTotal: number;
}

export function PrintDocument({
  brand,
  title,
  docNumber,
  docDate,
  dueDate,
  partyLabel,
  partyName,
  company,
  lines,
  subtotal,
  discount,
  taxRate,
  taxAmount,
  total,
  paid,
  notes,
  eta,
}: {
  brand: OfficeBrand;
  title: string;
  docNumber: string;
  docDate: Date | string;
  dueDate?: Date | string | null;
  partyLabel: string;
  partyName?: string | null;
  company?: string | null;
  lines: PrintLine[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paid?: number;
  notes?: string | null;
  eta?: { uuid: string; label: string } | null;
}) {
  const remaining = round2(total - (paid ?? 0));

  return (
    <div className="print-doc" dir="rtl">
      {/* الترويسة */}
      <header className="print-doc-head">
        <div className="print-doc-brand">
          <div className="print-doc-brand-name" style={{ color: brand.primary }}>
            {brand.name}
          </div>
          <div className="print-doc-brand-sub">{brand.subtitle}</div>
        </div>
        <div className="print-doc-title">{title}</div>
      </header>

      {/* بيانات الوثيقة */}
      <section className="print-doc-meta">
        <div className="print-doc-meta-item">
          <span>{title === "فاتورة شراء" ? "رقم الفاتورة" : "رقم الفاتورة"}</span>
          <b dir="ltr">{docNumber}</b>
        </div>
        <div className="print-doc-meta-item">
          <span>التاريخ</span>
          <b>{formatDate(docDate)}</b>
        </div>
        {dueDate ? (
          <div className="print-doc-meta-item">
            <span>موعد السداد</span>
            <b>{formatDate(dueDate)}</b>
          </div>
        ) : null}
        <div className="print-doc-meta-item">
          <span>{partyLabel}</span>
          <b>{partyName || "—"}</b>
        </div>
        {company ? (
          <div className="print-doc-meta-item">
            <span>العميل (المكتب)</span>
            <b>{company}</b>
          </div>
        ) : null}
        {eta ? (
          <div className="print-doc-meta-item">
            <span>{eta.label}</span>
            <b dir="ltr">{eta.uuid}</b>
          </div>
        ) : null}
      </section>

      {/* الأسطر */}
      <table className="print-doc-table">
        <thead>
          <tr>
            <th>البيان</th>
            <th>الكمية</th>
            <th>سعر الوحدة</th>
            <th>الخصم</th>
            <th>الضريبة %</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}</td>
              <td className="num">{l.quantity}</td>
              <td className="num">{formatMoney(l.unitPrice)}</td>
              <td className="num">{l.discount > 0 ? formatMoney(l.discount) : "—"}</td>
              <td className="num">{l.taxRate > 0 ? `${l.taxRate}%` : "—"}</td>
              <td className="num">{formatMoney(l.lineTotal)}</td>
            </tr>
          ))}
          {lines.length === 0 ? (
            <tr>
              <td colSpan={6} className="muted">
                لا توجد أسطر
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* الإجماليات */}
      <section className="print-doc-totals">
        <div className="row">
          <span>الإجمالي الفرعي</span>
          <b>{formatMoney(subtotal)}</b>
        </div>
        {discount > 0 ? (
          <div className="row">
            <span>الخصم</span>
            <b>{formatMoney(-discount)}</b>
          </div>
        ) : null}
        <div className="row">
          <span>ضريبة القيمة المضافة {taxRate > 0 ? `(${taxRate}%)` : ""}</span>
          <b>{formatMoney(taxAmount)}</b>
        </div>
        <div className="row grand">
          <span>الإجمالي المستحق</span>
          <b>{formatMoney(total)}</b>
        </div>
        {paid ? (
          <>
            <div className="row">
              <span>المدفوع</span>
              <b>{formatMoney(paid)}</b>
            </div>
            <div className="row">
              <span>المتبقي</span>
              <b>{formatMoney(remaining)}</b>
            </div>
          </>
        ) : null}
      </section>

      {notes ? <p className="print-doc-notes">{notes}</p> : null}

      {/* التوقيعات */}
      <footer className="print-doc-sigs">
        <div className="sig">
          <span>إعداد</span>
          <div className="sig-line" />
        </div>
        <div className="sig">
          <span>مراجعة</span>
          <div className="sig-line" />
        </div>
        <div className="sig">
          <span>ختم</span>
          <div className="sig-line" />
        </div>
      </footer>

      <p className="print-doc-foot">
        صدرت هذه الوثيقة آليًا من {brand.name} بتاريخ {formatDate(new Date())}
      </p>
    </div>
  );
}
