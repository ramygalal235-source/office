import Link from "next/link";
import {
  ArrowLeftRight,
  Banknote,
  Boxes,
  Building2,
  CalendarClock,
  ListTodo,
  TrendingDown,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { getPartyBalances, getSafeBalances } from "@/lib/accounting/ledger";
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
import { DashboardCharts } from "@/components/dashboard-charts";

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
  // النطاق المحاسبي: أرقام الدفاتر (مبيعات/مشتريات/نقدية/ذمم/أصول/رواتب)
  // تُعرض لشركة النطاق النشطة، بينما إدارة المكتب (التزامات/مهام/شركات) تبقى شاملة.
  const companyId = await requireCompanyId();

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
    revenueRows,
    customerBalances,
    obligationRows,
    assetAgg,
    employeeAgg,
    latestPayroll,
  ] = await Promise.all([
    db.clientCompany.count({ where: { kind: "CLIENT" } }),
    db.clientCompany.count({ where: { kind: "CLIENT", isActive: true } }),
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
      where: { companyId, date: { gte: monthStart, lte: monthEnd }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    db.purchase.aggregate({
      where: { companyId, date: { gte: monthStart, lte: monthEnd }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
    db.invoice.aggregate({
      where: { companyId, status: { in: ["ISSUED", "PARTIAL", "OVERDUE"] } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    db.purchase.aggregate({
      where: { companyId, status: { in: ["RECEIVED", "PARTIAL"] } },
      _sum: { totalAmount: true, paidAmount: true },
    }),
    db.journalEntry.findMany({
      where: { companyId },
      orderBy: { date: "desc" },
      take: 5,
      select: { id: true, number: true, date: true, description: true, status: true },
    }),
    getSafeBalances(companyId),
    // بيانات الرسوم البيانية
    db.invoice.findMany({
      where: { companyId, date: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { date: true, subtotal: true, taxAmount: true },
    }),
    getPartyBalances("CUSTOMER", companyId),
    db.taxObligation.findMany({
      where: { dueDate: { lte: new Date(now.getFullYear(), now.getMonth() + 6, 0) }, status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } },
      select: { dueDate: true },
    }),
    // الأصول والرواتب (وحدات جديدة)
    db.fixedAsset.aggregate({
      where: { companyId, status: "ACTIVE" },
      _sum: { cost: true, accumulatedDepreciation: true },
      _count: { _all: true },
    }),
    db.employee.aggregate({
      where: { companyId, isActive: true },
      _sum: { basicSalary: true, housingAllowance: true, transportAllowance: true, otherAllowance: true },
      _count: { _all: true },
    }),
    db.payrollRun.findFirst({
      where: { companyId },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      select: { periodYear: true, periodMonth: true, status: true, totalNet: true, paidAt: true },
    }),
  ]);



  const sales = monthInvoices._sum.totalAmount ?? 0;
  const purchases = monthPurchases._sum.totalAmount ?? 0;
  const cashTotal = sumMoney(safeList.map((s) => s.balance));
  const receivable = round2((receivables._sum.totalAmount ?? 0) - (receivables._sum.paidAmount ?? 0));
  const payable = round2((payables._sum.totalAmount ?? 0) - (payables._sum.paidAmount ?? 0));

  // ===== بيانات الرسوم البيانية =====
  const monthLabels: { label: string; key: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthLabels.push({ label: d.toLocaleDateString("ar-EG", { month: "short" }), key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
  }
  const monthlyRevenue = monthLabels.map((m) => ({ ...m, month: m.label, net: 0, tax: 0 }));
  for (const inv of revenueRows) {
    const key = `${new Date(inv.date).getFullYear()}-${String(new Date(inv.date).getMonth() + 1).padStart(2, "0")}`;
    const slot = monthlyRevenue.find((x) => x.key === key);
    if (slot) {
      slot.net = round2(slot.net + inv.subtotal);
      slot.tax = round2(slot.tax + inv.taxAmount);
    }
  }

  const receivablesTop = customerBalances
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8)
    .map((c) => ({ name: c.name, balance: c.balance }));

  const obBuckets: { label: string; start: number; end: number; upcoming: number; overdue: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const start = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    obBuckets.push({
      label: start.toLocaleDateString("ar-EG", { month: "short" }),
      start: start.getTime(),
      end: end.getTime(),
      upcoming: 0,
      overdue: 0,
    });
  }
  for (const o of obligationRows) {
    const t = new Date(o.dueDate).getTime();
    if (t < now.getTime()) {
      obBuckets[0].overdue++;
    } else {
      const b = obBuckets.find((x) => t >= x.start && t < x.end);
      if (b) b.upcoming++;
    }
  }
  const obligationsChart = obBuckets.map((b) => ({ month: b.label, upcoming: b.upcoming, overdue: b.overdue }));

  // ===== الأصول والرواتب =====
  const assetCost = assetAgg._sum.cost ?? 0;
  const assetAccum = assetAgg._sum.accumulatedDepreciation ?? 0;
  const assetBookValue = round2(assetCost - assetAccum);
  const employeeCount = employeeAgg._count._all;
  const monthlyPayroll = round2(
    (employeeAgg._sum.basicSalary ?? 0) +
      (employeeAgg._sum.housingAllowance ?? 0) +
      (employeeAgg._sum.transportAllowance ?? 0) +
      (employeeAgg._sum.otherAllowance ?? 0)
  );
  const payrollLabel = latestPayroll
    ? `${latestPayroll.periodMonth}/${latestPayroll.periodYear} — ${
        latestPayroll.status === "POSTED" ? (latestPayroll.paidAt ? "مُصروف" : "مرحّلة") : "مسودة"
      }`
    : "لا يوجد شغل بعد";

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

      {/* ===== الأصول والموظفون والرواتب ===== */}
      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="الأصول (قيمة دفترية)"
          value={formatMoney(assetBookValue)}
          hint={`${assetAgg._count._all} أصل نشط — تكلفة ${formatMoney(assetCost)}`}
          icon={Boxes}
          tone="info"
        />
        <StatCard
          label="الموظفون النشطون"
          value={`${employeeCount}`}
          hint={`رواتب شهرية ${formatMoney(monthlyPayroll)}`}
          icon={UserRound}
        />
        <StatCard
          label="آخر شغل رواتب"
          value={latestPayroll ? formatMoney(latestPayroll.totalNet) : "—"}
          hint={payrollLabel}
          icon={Banknote}
          tone={latestPayroll ? "success" : "default"}
        />
      </section>

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

      <DashboardCharts
        monthlyRevenue={monthlyRevenue.map(({ month, net, tax }) => ({ month, net, tax }))}
        receivables={receivablesTop}
        obligations={obligationsChart}
      />

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
