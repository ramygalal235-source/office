import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { DocumentsBoard, type BoardDocument } from "@/components/documents-board";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await getSession();
  if (!user) return null;

  const [docs, clients] = await Promise.all([
    db.dmsDocument.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, nameAr: true } },
        extractions: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { invoices: true, purchases: true, payments: true } },
      },
    }),
    db.clientCompany.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true },
      orderBy: { nameAr: "asc" },
    }),
  ]);

  const rows: BoardDocument[] = docs.map((d) => {
    const ex = d.extractions[0];
    return {
      id: d.id,
      title: d.title,
      type: d.type,
      status: d.status,
      clientId: d.clientId,
      clientName: d.client?.nameAr ?? null,
      mimeType: d.mimeType,
      createdAt: d.createdAt.toISOString(),
      extraction: ex
        ? {
            id: ex.id,
            status: ex.status,
            provider: ex.provider,
            model: ex.model,
            confidence: ex.confidence,
            fields: ex.fields,
            reviewedBy: ex.reviewedBy,
            createdAt: ex.createdAt.toISOString(),
          }
        : null,
      linked: { invoices: d._count.invoices, purchases: d._count.purchases, payments: d._count.payments },
    };
  });

  return (
    <>
      <PageHeader
        title="الوثائق والاستخراج الآلي"
        description="ارفع أي فاتورة أو إيصال فيُستخرج محتواها آليًا — ثم تراجعه وتُعتمده، فيتحوّل إلى مستند محاسبي مسودة. لا يُرحَّل شيء آليًا: الترحيل قرارك."
      />
      <DocumentsBoard initialDocuments={rows} initialClients={clients} userRole={user.role} />
    </>
  );
}
