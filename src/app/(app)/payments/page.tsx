import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { PaymentsBoard, type BoardPayment } from "@/components/payments-board";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const user = await getSession();
  if (!user) return null;

  const companyId = await requireCompanyId();
  const [payments, parties, safes] = await Promise.all([
    db.payment.findMany({
      where: { companyId },
      orderBy: { date: "desc" },
      take: 300,
      include: { party: { select: { id: true, name: true } }, safe: { select: { id: true, name: true } } },
    }),
    db.party.findMany({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, take: 500 }),
    db.safe.findMany({ where: { companyId, isActive: true }, orderBy: { code: "asc" } }),
  ]);

  const posted = await db.journalEntry.findMany({
    where: { companyId, sourceType: "PAYMENT", sourceId: { in: payments.map((p) => p.id) } },
    select: { sourceId: true },
  });
  const postedSet = new Set(posted.map((e) => e.sourceId));

  const rows: BoardPayment[] = payments.map((p) => ({
    id: p.id,
    number: p.number,
    type: p.type,
    partyId: p.partyId,
    partyName: p.party?.name ?? null,
    safeId: p.safeId,
    safeName: p.safe?.name ?? null,
    date: p.date.toISOString(),
    amount: p.amount,
    method: p.method,
    reference: p.reference,
    notes: p.notes,
    journalPosted: postedSet.has(p.id),
  }));

  return (
    <>
      <PageHeader
        title="التحصيل والدفع"
        description="أذون القبض والصرف — كل سند يحدد موقعه النقدي، ويُرحَّل إلى قيود اليومية بزر واحد."
      />
      <PaymentsBoard
        initialPayments={rows}
        parties={parties.map((p) => ({ id: p.id, name: p.name, type: p.type }))}
        safes={safes.map((s) => ({ id: s.id, name: s.name, type: s.type }))}
        userRole={user.role}
      />
    </>
  );
}
