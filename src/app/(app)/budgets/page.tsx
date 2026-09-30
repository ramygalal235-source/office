import { Target } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, round2, sumMoney } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { BudgetForm } from "./budget-form";
import { BudgetRowActions } from "./budget-row-actions";

export const metadata = { title: "الموازنات | دفاتر المحاسب" };

const STATUS: Record<string, { label: string; variant: "muted" | "info" | "success" }> = {
  DRAFT: { label: "مسودة", variant: "muted" },
  ACTIVE: { label: "نشطة", variant: "info" },
  CLOSED: { label: "مغلقة", variant: "success" },
};

export default async function BudgetsPage() {
  const session = await getSession();
  const [budgets, accounts] = await Promise.all([
    db.budget.findMany({
      include: { lines: { include: { account: { select: { code: true, name: true } } }, orderBy: [
        { periodMonth: "asc" },
      ] } },
      orderBy: [{ fiscalYear: "desc" }, { createdAt: "desc" }],
    }),
    db.account.findMany({
      where: { isGroup: false, isActive: true, type: { in: ["EXPENSE", "INCOME"] } },
      select: { id: true, code: true, name: true, type: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const totalBudgeted = sumMoney(budgets.flatMap((b) => b.lines.map((l) => l.amount)));
  const totalActual = sumMoney(budgets.flatMap((b) => b.lines.map((l) => l.actualAmount)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الموازنات"
        description="المخطَّط مقابل الفعلي لكل حساب — الفعلي يُسحب من قيود اليومية المرحَّلة."
        actions={
          <BudgetForm
            trigger={
              <Button size="sm">
                <Target /> موازنة جديدة
              </Button>
            }
            accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}`, type: a.type }))}
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="موازنات" value={`${budgets.length}`} icon={Target} />
        <StatCard label="إجمالي المخطط" value={formatMoney(totalBudgeted)} tone="info" />
        <StatCard label="إجمالي الفعلي" value={formatMoney(totalActual)} />
        <StatCard
          label="الانحراف"
          value={formatMoney(round2(totalBudgeted - totalActual))}
          hint="مخطط − فعلي"
          tone={totalBudgeted - totalActual >= 0 ? "success" : "destructive"}
        />
      </section>

      {budgets.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              className="m-4 border-0"
              icon={Target}
              title="لا توجد موازنات بعد"
              description="أنشئ موازنة مصروفات أو إيرادات لسنة مالية، وأضف أسطرًا بالحساب والمبلغ (شهري أو سنوي)."
            />
          </CardContent>
        </Card>
      ) : (
        budgets.map((b) => {
          const st = STATUS[b.status] ?? STATUS.DRAFT;
          const budgeted = sumMoney(b.lines.map((l) => l.amount));
          const actual = sumMoney(b.lines.map((l) => l.actualAmount));
          const within = b.type === "EXPENSE" ? actual <= budgeted : actual >= budgeted;
          const relation = within ? "ضمن" : b.type === "EXPENSE" ? "تجاوز" : "أقل من";
          return (
            <Card key={b.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{b.name}</CardTitle>
                  <CardDescription>
                    {b.type === "EXPENSE" ? "مصروفات" : "إيرادات"} — مخطط {formatMoney(budgeted)} · فعلي{" "}
                    {formatMoney(actual)} · {relation} المخطط
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={st.variant}>{st.label}</Badge>
                  <BudgetRowActions
                    id={b.id}
                    status={b.status}
                    isAdmin={session?.role === "admin"}
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0 pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الحساب</TableHead>
                      <TableHead>الفترة</TableHead>
                      <TableHead className="text-start">المخطط</TableHead>
                      <TableHead className="text-start">الفعلي</TableHead>
                      <TableHead className="text-start">المتبقي</TableHead>
                      <TableHead>الاستهلاك</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {b.lines.map((l) => {
                      const remaining = round2(l.amount - l.actualAmount);
                      const pct = l.amount > 0 ? Math.min(100, Math.round((l.actualAmount / l.amount) * 100)) : 0;
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="text-sm">
                            {l.account ? `${l.account.code} — ${l.account.name}` : l.categoryName}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {l.periodMonth ? `شهر ${l.periodMonth}` : "سنوي"}
                          </TableCell>
                          <TableCell className="tabular text-start">{formatMoney(l.amount)}</TableCell>
                          <TableCell className="tabular text-start text-sm">{formatMoney(l.actualAmount)}</TableCell>
                          <TableCell className="tabular text-start text-sm font-semibold">
                            {formatMoney(remaining)}
                          </TableCell>
                          <TableCell className="w-28">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground">{pct}%</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
