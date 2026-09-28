import { ScrollText } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, round2 } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { journalStatusLabel } from "@/components/status-badge";
import { ReverseButton } from "./reverse-button";

export const metadata = { title: "قيود اليومية | دفاتر المحاسب" };

const SOURCE_LABELS: Record<string, string> = {
  INVOICE: "فاتورة بيع",
  PURCHASE: "فاتورة شراء",
  PAYMENT: "سند",
  REVERSAL: "قيد عكسي",
  MANUAL: "قيد يدوي",
  OPENING: "رصيد افتتاحي",
};

export default async function JournalPage() {
  const session = await getSession();
  const [entries, sums] = await Promise.all([
    db.journalEntry.findMany({
      where: { status: { not: "REVERSED" } },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { account: { select: { code: true, name: true } } },
        },
      },
      orderBy: [{ date: "desc" }, { number: "desc" }],
      take: 60,
    }),
    db.journalEntry.aggregate({
      where: { status: "POSTED" },
      _sum: { totalDebit: true, totalCredit: true },
      _count: { _all: true },
    }),
  ]);

  const canReverse = session?.role !== "viewer";
  const totalDebit = round2(sums._sum.totalDebit ?? 0);
  const totalCredit = round2(sums._sum.totalCredit ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="قيود اليومية"
        description="كل القيود المرحّلة. القيود لا تُحذف — يُنشأ قيد عكسي عند التصحيح."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="عدد القيود" value={String(sums._count._all)} icon={ScrollText} />
        <StatCard label="إجمالي المدين" value={formatMoney(totalDebit)} />
        <StatCard
          label="إجمالي الدائن"
          value={formatMoney(totalCredit)}
          hint={Math.abs(totalDebit - totalCredit) < 0.01 ? "القيد متوازن ✓" : "يوجد فرق!"}
          tone={Math.abs(totalDebit - totalCredit) < 0.01 ? "success" : "destructive"}
        />
      </section>

      {entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="لا توجد قيود"
          description="رحّل فاتورة بيع أو شراء أو سند قبض لتظهر قيودها هنا."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const st = journalStatusLabel(entry.status);
            return (
              <Card key={entry.id}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular text-sm font-bold">{entry.number}</span>
                      <Badge variant={st.variant}>{st.label}</Badge>
                      {entry.sourceType && (
                        <Badge variant="outline" className="text-[10px]">
                          {SOURCE_LABELS[entry.sourceType] ?? entry.sourceType}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                    </div>
                    <ReverseButton id={entry.id} disabled={!canReverse || entry.status === "REVERSED"} />
                  </div>

                  <p className="text-sm font-medium">{entry.description}</p>

                  <div className="overflow-hidden rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60">
                        <tr>
                          <th className="w-20 p-2 text-start text-xs font-semibold">الكود</th>
                          <th className="p-2 text-start text-xs font-semibold">الحساب</th>
                          <th className="p-2 text-start text-xs font-semibold">البيان</th>
                          <th className="w-28 p-2 text-start text-xs font-semibold">مدين</th>
                          <th className="w-28 p-2 text-start text-xs font-semibold">دائن</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.lines.map((line) => (
                          <tr key={line.id} className="border-t">
                            <td className="tabular p-2 text-xs text-muted-foreground">
                              {line.account.code}
                            </td>
                            <td className="p-2">{line.account.name}</td>
                            <td className="p-2 text-xs text-muted-foreground">{line.description}</td>
                            <td className="tabular p-2 text-start">
                              {line.debit ? formatMoney(line.debit) : "—"}
                            </td>
                            <td className="tabular p-2 text-start">
                              {line.credit ? formatMoney(line.credit) : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t bg-muted/40 font-semibold">
                          <td colSpan={3} className="p-2 text-end">
                            الإجمالي
                          </td>
                          <td className="tabular p-2 text-start">{formatMoney(entry.totalDebit)}</td>
                          <td className="tabular p-2 text-start">{formatMoney(entry.totalCredit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {entry.createdBy && (
                    <>
                      <Separator />
                      <p className="text-[11px] text-muted-foreground">بواسطة: {entry.createdBy}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
