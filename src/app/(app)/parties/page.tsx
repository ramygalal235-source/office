import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { getSession } from "@/lib/auth";
import { getPartyBalances } from "@/lib/accounting/ledger";
import { PageHeader } from "@/components/page-header";
import { PartiesBoard, type BoardParty } from "@/components/parties-board";

export const dynamic = "force-dynamic";

export default async function PartiesPage() {
  const user = await getSession();
  if (!user) return null;

  const companyId = await requireCompanyId();
  const [parties, customerBalances, supplierBalances] = await Promise.all([
    db.party.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 500 }),
    getPartyBalances("CUSTOMER", companyId),
    getPartyBalances("SUPPLIER", companyId),
  ]);

  const balanceBy = new Map<string, number>([
    ...customerBalances.map((b) => [b.partyId, b.balance]),
    ...supplierBalances.map((b) => [b.partyId, b.balance]),
  ]);

  const rows: BoardParty[] = parties.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    legalName: p.legalName,
    taxNumber: p.taxNumber,
    commercialReg: p.commercialReg,
    phone: p.phone,
    email: p.email,
    address: p.address,
    city: p.city,
    openingBalance: p.openingBalance,
    balanceSide: p.balanceSide,
    creditLimit: p.creditLimit,
    notes: p.notes,
    isActive: p.isActive,
    balance: balanceBy.get(p.id) ?? p.openingBalance,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="العملاء والموردون"
        description="أطراف الحساب مع أرصدتهم المحسوبة من الفواتير والسندات — عميل دائن له، ومورد مدين له."
      />
      <PartiesBoard initialParties={rows} userRole={user.role} />
    </>
  );
}
