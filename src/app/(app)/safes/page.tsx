import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getSafeBalances } from "@/lib/accounting/ledger";
import { PageHeader } from "@/components/page-header";
import { SafesBoard, type BoardSafe } from "@/components/safes-board";

export const dynamic = "force-dynamic";

export default async function SafesPage() {
  const user = await getSession();
  if (!user) return null;

  const [safes, balances, accounts] = await Promise.all([
    db.safe.findMany({ orderBy: { code: "asc" } }),
    getSafeBalances(),
    db.account.findMany({ orderBy: { code: "asc" }, take: 200 }),
  ]);

  const balBy = new Map(balances.map((b) => [b.id, b]));

  const rows: BoardSafe[] = safes.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    type: s.type,
    accountId: s.accountId,
    openingBalance: s.openingBalance,
    bankName: s.bankName,
    accountNumber: s.accountNumber,
    iban: s.iban,
    branch: s.branch,
    currency: s.currency,
    isActive: s.isActive,
    totalIn: balBy.get(s.id)?.totalIn ?? 0,
    totalOut: balBy.get(s.id)?.totalOut ?? 0,
    balance: balBy.get(s.id)?.balance ?? s.openingBalance,
    movementCount: balBy.get(s.id)?.movementCount ?? 0,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="الخزائن والبنوك"
        description="المواقع النقدية: خزائن نقدية وحسابات بنكية، بأرصدتها المحسوبة من الحركة."
      />
      <SafesBoard initialSafes={rows} accounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name }))} userRole={user.role} />
    </>
  );
}
