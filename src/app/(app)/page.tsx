import Link from "next/link";
import {
  ArrowLeftRight,
  Building2,
  CalendarClock,
  ListTodo,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSafeBalances } from "@/lib/accounting/ledger";
import { dueLabel, formatDate, formatMoney, round2, sumMoney } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  obligationStatusLabel,
  priorityLabel,
  taskStatusLabel,
} from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { ControlTower } from "@/components/control-tower";

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

export default async function DashboardPage() {
  const session = await getSession();
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [
    clientsCount,
    activeClients,
    upcomingObligations,
    overdueObligations,
    myTasks,
    overdueTasks,
    monthInvoices,
    monthPurchases,
    receivables,
    payables,
    recentEntries,
    safeList,
  ] = await Promise.all([
    db.clientCompany.count(),
    db.clientCompany.count({ where: { isActive: true } }),
    db.taxObligation.findMany({
      where: { dueDate: { gte: now, lte: in30 }, status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } },
      include: { company: { select: { nameAr: true, code: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    db.taxObligation.count({ where: { dueDate: { lt: now }, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
    db.officeTask.findMany({
      where: { assignedTo: session?.uid ?? "", status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } },
      include: { company: { select: { nameAr: true } } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 6,
    }),
    db.officeTask.count({
      where: { dueDate: { lt: now }, status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } },
    }),
    db.invoice.aggregate({
      where: { date: { gte: monthStart, lte: monthEnd }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    db.purchase.aggregate({
      where: { date: { gte: monthStart, lte: monthEnd }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    db.invoice.aggregate({
      where: { status: { in: ["ISSUED", "PARTIAL", "OVERDUE"] } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    db.purchase.aggregate({
      where: { status: { in: ["RECEIVED", "PARTIAL"] } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    db.journalEntry.findMany({
      orderBy: { date: "desc" },
      take: 5,
      select: { id: true, number: true, date: true, description: true, status: true },
    }),
    getSafeBalances(),
  ]);

  const sales = monthInvoices._sum.totalAmount ?? 0;
  const purchases = monthPurchases._sum.totalAmount ?? 0;
  const cashTotal = sumMoney(safeList.map((s) => s.balance));
  const receivable = round2((receivables._sum.totalAmount ?? 0) - (receivables._sum.paidAmount ?? 0));
  const payable = round2((payables._sum.totalAmount ?? 0) - (payables._sum.paidAmount ?? 0));

  const hour = now.getHours();
  const greeting = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء الخير" : "مساء الخير";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting}، ${session?.name ?? ""}`}
        description={`ملخص شغلك ليوم ${formatDate(now)}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/tasks">المهام</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/invoices">فاتورة جديدة</Link>
            </Button>
          </>
        }
      />

      {/* ===== المؤشرات المالية ===== */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="مبيعات الشهر"
          value={formatMoney(sales)}
          hint={`${monthInvoices._count._all} فاتورة`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="مشتريات الشهر"
          value={formatMoney(purchases)}
          hint={`${monthPurchases._count._all} فاتورة شراء`}
          icon={TrendingDown}
          tone="warning"
        />
        <StatCard
          label="النقدية في الخزائن"
          value={formatMoney(cashTotal)}
          hint={`${safeList.length} خزينة`}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          label="صافي رصيد الشهر"
          value={formatMoney(sales - purchases)}
          hint="المبيعات ناقص المشتريات"
          icon={ArrowLeftRight}
          tone={sales - purchases >= 0 ? "success" : "destructive"}
        />
      </section>

      <ControlTower />

      {/* ===== مؤشرات شغل المكتب ===== */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="شركات العملاء"
          value={`${activeClients}`}
          hint={`${clientsCount} ملف محفوظ`}
          icon={Building2}
        />
        <StatCard
          label="التزامات خلال 30 يوم"
          value={`${upcomingObligations.length}`}
          hint={`${overdueObligations} التزام متأخر`}
          icon={CalendarClock}
          tone={overdueObligations > 0 ? "destructive" : "default"}
        />
        <StatCard
          label="مهامي المفتوحة"
          value={`${myTasks.length}`}
          hint={`${overdueTasks} مهمة متأخرة`}
          icon={ListTodo}
          tone={overdueTasks > 0 ? "warning" : "default"}
        />
        <StatCard
          label="ذمم العملاء (مستحقة)"
          value={formatMoney(receivable)}
          hint={`ذمم الموردين ${formatMoney(payable)}`}
          icon={TrendingUp}
          tone={receivable > 0 ? "info" : "default"}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ===== الالتزامات القادمة ===== */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">الالتزامات الضريبية القادمة</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/obligations">عرض الكل</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {upcomingObligations.length === 0 ? (
              <EmptyState
                className="m-4 border-0"
                icon={CalendarClock}
                title="لا توجد التزامات قريبة"
                description="لا يوجد استحقاق ضريبي خلال الثلاثين يومًا القادمة."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الالتزام</TableHead>
                    <TableHead>الشركة</TableHead>
                    <TableHead>الاستحقاق</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcomingObligations.map((o) => {
                    const st = obligationStatusLabel(o.status);
                    const due = new Date(o.dueDate);
                    const soon = due.getTime() < now.getTime() + 7 * 86400000;
                    return (
                      <TableRow key={o.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{o.title}</span>
                            <span className="text-xs text-muted-foreground">{o.period}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{o.company?.nameAr ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col text-sm">
                            <span className="tabular">{formatDate(o.dueDate)}</span>
                            <span className={soon ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                              {dueLabel(o.dueDate)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ===== مهامي ===== */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">مهامي المفتوحة</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/tasks">عرض الكل</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {myTasks.length === 0 ? (
              <EmptyState
                className="m-4 border-0"
                icon={ListTodo}
                title="لا توجد مهام مفتوحة"
                description="مهامك المُسندة إليك ستظهر هنا."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المهمة</TableHead>
                    <TableHead>الشركة</TableHead>
                    <TableHead>الاستحقاق</TableHead>
                    <TableHead>الأولوية</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myTasks.map((t) => {
                    const p = priorityLabel(t.priority);
                    const s = taskStatusLabel(t.status);
                    const late = t.dueDate ? new Date(t.dueDate) < now : false;
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{t.title}</span>
                            <Badge variant={s.variant} className="mt-1 w-fit">
                              {s.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{t.company?.nameAr ?? "—"}</TableCell>
                        <TableCell className={late ? "text-sm text-destructive" : "text-sm"}>
                          {t.dueDate ? formatDate(t.dueDate) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.variant}>{p.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===== آخر القيود ===== */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">آخر القيود اليومية</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/journal">دفتر اليومية</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentEntries.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={ArrowLeftRight}
              title="لا توجد قيود بعد"
              description="القيود اليومية التي تُرحّل من الفواتير والمصروفات ستظهر هنا."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم القيد</TableHead>
                  <TableHead>البيان</TableHead>
                  <TableHead>التاريخ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentEntries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="tabular font-medium">{e.number}</TableCell>
                    <TableCell className="text-sm">{e.description}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(e.date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
