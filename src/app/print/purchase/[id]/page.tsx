import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOfficeBrand } from "@/lib/office-brand";
import { PrintDocument } from "@/components/print-document";
import { AutoPrint } from "@/components/auto-print";

export const dynamic = "force-dynamic";
export const metadata = { title: "طباعة فاتورة شراء | دفاتر المحاسب" };

export default async function PrintPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const [purchase, brand] = await Promise.all([
    db.purchase.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: "asc" } }, supplier: true, company: true },
    }),
    getOfficeBrand(),
  ]);
  if (!purchase) redirect("/purchases");

  return (
    <div className="print-page">
      <PrintDocument
        brand={brand}
        title="فاتورة شراء"
        docNumber={purchase.purchaseNumber}
        docDate={purchase.date}
        dueDate={purchase.dueDate}
        partyLabel="المورد"
        partyName={purchase.supplier?.name}
        company={purchase.company?.name}
        lines={purchase.items.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          taxRate: l.taxRate,
          lineTotal: l.lineTotal,
        }))}
        subtotal={purchase.subtotal}
        discount={purchase.discount}
        taxRate={purchase.taxRate}
        taxAmount={purchase.taxAmount}
        total={purchase.totalAmount}
        paid={purchase.paidAmount || undefined}
        notes={purchase.notes}
      />
      <AutoPrint />
    </div>
  );
}
