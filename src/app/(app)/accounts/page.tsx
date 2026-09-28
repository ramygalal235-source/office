import { BookOpen } from "lucide-react";
import { getAccountBalances } from "@/lib/accounting/ledger";
import { ACCOUNT_NATURE } from "@/lib/accounting/constants";
import { formatMoney, round2 } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const metadata = { title: "دليل الحسابات | دفاتر المحاسب" };

const TYPE_LABELS: Record<string, string> = {
  ASSET: "أصول",
  LIABILITY: "التزامات",
  EQUITY: "حقوق ملكية",
  INCOME: "إيرادات",
  EXPENSE: "مصروفات",
};

export default async function AccountsPage() {
  const balances = await getAccountBalances();
  const leaf = balances.filter((b) => !b.isGroup);
  const withMovement = leaf.filter((b) => b.balance !== 0);

  const totals = {
    ASSET: round2(withMovement.filter((b) => b.type === "ASSET").reduce((a, b) => a + Math.abs(b.balance), 0)),
    LIABILITY: round2(withMovement.filter((b) => b.type === "LIABILITY").reduce((a, b) => a + Math.abs(b.balance), 0)),
    EQUITY: round2(withMovement.filter((b) => b.type === "EQUITY").reduce((a, b) => a + Math.abs(b.balance), 0)),
    INCOME: round2(withMovement.filter((b) => b.type === "INCOME").reduce((a, b) => a + Math.abs(b.balance), 0)),
    EXPENSE: round2(withMovement.filter((b) => b.type === "EXPENSE").reduce((a, b) => a + Math.abs(b.balance), 0)),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="دليل الحسابات"
        description="الشجرة القياسية للحسابات وأرصدتها الحالية من القيود المرحّلة."
      />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const).map((t) => (
          <Card key={t}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{TYPE_LABELS[t]}</p>
              <p className="tabular text-lg font-bold">{formatMoney(totals[t])}</p>
              <p className="text-[11px] text-muted-foreground">
                طبيعة الحساب: {ACCOUNT_NATURE[t] === "DEBIT" ? "مدين" : "دائن"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">الكود</TableHead>
                <TableHead>اسم الحساب</TableHead>
                <TableHead className="w-24">النوع</TableHead>
                <TableHead className="text-start">الرصيد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.map((b) => {
                const isGroup = b.isGroup;
                const nature = ACCOUNT_NATURE[b.type] ?? "DEBIT";
                const showDebit = b.balance > 0;
                return (
                  <TableRow key={b.accountId} className={isGroup ? "bg-muted/40" : undefined}>
                    <TableCell className="tabular text-xs text-muted-foreground">{b.code}</TableCell>
                    <TableCell
                      style={{ paddingInlineStart: `${0.75 + (b.level - 1) * 1.1}rem` }}
                      className={isGroup ? "font-semibold" : ""}
                    >
                      <span className="flex items-center gap-2">
                        {isGroup && <span className="text-muted-foreground">▸</span>}
                        {b.name}
                        {!b.isGroup && !isGroup && b.balance === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isGroup ? "outline" : "muted"} className="text-[10px]">
                        {TYPE_LABELS[b.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular text-start font-medium">
                      {isGroup || b.balance === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {formatMoney(Math.abs(b.balance))}
                          <span className="ms-1 text-[10px] text-muted-foreground">
                            {nature === "DEBIT" ? "مدين" : "دائن"}
                          </span>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BookOpen className="size-3.5" />
        {balances.length} حساب — الأرصدة محسوبة من القيود المرحّلة فقط
      </p>
    </div>
  );
}
