import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOfficeBrand } from "@/lib/office-brand";
import { PrintDocument } from "@/components/print-document";
import { AutoPrint } from "@/components/auto-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "طباعة فاتورة | دفاتر المحاسب" };

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const [invoice, brand] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: "asc" } }, customer: true, company: true },
    }),
    getOfficeBrand(),
  ]);
  if (!invoice) redirect("/invoices");

  return (
    <div className="print-page">
      <PrintDocument
        brand={brand}
        title="فاتورة بيع"
        docNumber={invoice.invoiceNumber}
        docDate={invoice.date}
        dueDate={invoice.dueDate}
        partyLabel="العميل"
        partyName={invoice.customer?.name}
        company={invoice.company?.name}
        lines={invoice.items.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          taxRate: l.taxRate,
          lineTotal: l.lineTotal,
        }))}
        subtotal={invoice.subtotal}
        discount={invoice.discount}
        taxRate={invoice.taxRate}
        taxAmount={invoice.taxAmount}
        total={invoice.totalAmount}
        paid={invoice.paidAmount || undefined}
        notes={invoice.notes}
      />
      <AutoPrint />
    </div>
  );
}
