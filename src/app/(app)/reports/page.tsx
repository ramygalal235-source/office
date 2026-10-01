import { BarChart3, CheckCircle2, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { requireCompanyId } from "@/lib/company-context";
import { MonthCloseCard } from "./month-close-card";
import { getFinancialStatement, getPartyBalances, getTrialBalance } from "@/lib/accounting/ledger";
import { formatDate, formatMoney, round2, sumMoney } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { PrintReportLink } from "@/components/print-report-link";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const metadata = { title: "التقارير المالية | دفاتر المحاسب" };

function startOfYear() {
  return new Date(new Date().getFullYear(), 0, 1);
}

export default async function ReportsPage() {
  const yearStart = startOfYear();
  const now = new Date();
  const [companyId, session] = await Promise.all([requireCompanyId(), getSession()]);

  const [trial, statement, customers, suppliers, vat, assets, agingInvoices] = await Promise.all([
    getTrialBalance({ from: yearStart, to: now }, companyId),
    getFinancialStatement({ from: yearStart, to: now }, companyId),
    getPartyBalances("CUSTOMER", companyId),
    getPartyBalances("SUPPLIER", companyId),
    db.invoice.aggregate({
      where: { companyId, date: { gte: yearStart, lte: now }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { subtotal: true, discount: true, taxAmount: true, totalAmount: true },
      _count: { _all: true },
    }),
    db.fixedAsset.findMany({
      where: { companyId },
      include: { account: { select: { code: true } }, depreciations: { select: { periodYear: true, amount: true } } },
      orderBy: { code: "asc" },
    }),
    db.invoice.findMany({
      where: { companyId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      select: { customerId: true, totalAmount: true, paidAmount: true, dueDate: true, date: true },
    }),
  ]);

  const receivable = sumMoney(customers.map((c) => Math.max(0, c.balance)));
  const payable = sumMoney(suppliers.map((s) => Math.max(0, s.balance)));

  // ===== تحليل أعمار الذمم (ذمم العملاء) =====
  const DAY = 86400000;
  const agingDefs = [
    { key: "overdue", label: "متأخرة" },
    { key: "b1", label: "1–30 يوم" },
    { key: "b2", label: "31–60 يوم" },
    { key: "b3", label: "61–90 يوم" },
    { key: "b4", label: "+90 يوم" },
  ];
  const agingMap = new Map<string, { name: string; total: number; cells: Record<string, number> }>();
  for (const inv of agingInvoices) {
    const out = round2(inv.totalAmount - (inv.paidAmount ?? 0));
    if (out <= 0.005 || !inv.customerId) continue;
    const ref = inv.dueDate ?? inv.date;
    const daysLate = Math.floor((now.getTime() - ref.getTime()) / DAY);
    const key = daysLate < 0 ? "overdue" : daysLate <= 30 ? "b1" : daysLate <= 60 ? "b2" : daysLate <= 90 ? "b3" : "b4";
    let row = agingMap.get(inv.customerId);
    if (!row) {
      row = { name: inv.customerId, total: 0, cells: Object.fromEntries(agingDefs.map((d) => [d.key, 0])) };
      agingMap.set(inv.customerId, row);
    }
    row.cells[key] = round2(row.cells[key] + out);
    row.total = round2(row.total + out);
  }
  for (const c of customers) if (c.balance > 0 && agingMap.has(c.partyId)) agingMap.get(c.partyId)!.name = c.name;
  const agingRows = [...agingMap.entries()]
    .map(([id, r]) => ({ id, name: r.name, total: r.total, cells: r.cells }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);
  const agingTotals: Record<string, number> = Object.fromEntries(
    agingDefs.map((d) => [d.key, round2(agingRows.reduce((a, r) => a + r.cells[d.key], 0))])
  );
  const agingGrand = round2(agingRows.reduce((a, r) => a + r.total, 0));

  // ملخص ضريبة القيمة المضافة على فواتير البيع
  const outputVat = round2(vat._sum.taxAmount ?? 0);
  const netSales = round2((vat._sum.subtotal ?? 0) - (vat._sum.discount ?? 0));
  const inputVat = round2(
    (await db.journalLine.aggregate({
      where: { account: { code: "1108" }, journalEntry: { status: "POSTED", date: { gte: yearStart, lte: now } } },
      _sum: { debit: true },
    }))._sum.debit ?? 0
  );
  const netVat = round2(outputVat - inputVat);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="التقارير المالية"
        description={`سنة ${now.getFullYear()} المالية — من ${formatDate(yearStart)} إلى ${formatDate(now)}`}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="صافي المبيعات" value={formatMoney(netSales)} icon={BarChart3} />
        <StatCard label="ضريبة المخرجات" value={formatMoney(outputVat)} tone="warning" />
        <StatCard label="ضريبة المدخلات" value={formatMoney(inputVat)} tone="info" />
        <StatCard
          label="صافي ضريبة القيمة المضافة"
          value={formatMoney(netVat)}
          tone={netVat > 0 ? "destructive" : "success"}
          hint={netVat > 0 ? "مستحقة للسداد" : "رصيد دائن"}
        />
      </section>

      <Tabs defaultValue="trial">
        <TabsList>
          <TabsTrigger value="trial">ميزان المراجعة</TabsTrigger>
          <TabsTrigger value="statements">القوائم المالية</TabsTrigger>
          <TabsTrigger value="receivables">ذمم العملاء والموردين</TabsTrigger>
          <TabsTrigger value="vat">ملخص القيمة المضافة</TabsTrigger>
          <TabsTrigger value="assets">الأصول الثابتة</TabsTrigger>
          <TabsTrigger value="close">إغلاق الشهر</TabsTrigger>
        </TabsList>

        {/* ===== ميزان المراجعة ===== */}
        <TabsContent value="trial">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">ميزان المراجعة</CardTitle>
              <div className="flex items-center gap-2">
              <Badge variant={trial.balanced ? "success" : "destructive"}>
                {trial.balanced ? (
                  <>
                    <CheckCircle2 className="size-3" /> متوازن
                  </>
                ) : (
                  <>
                    <XCircle className="size-3" /> فرق {formatMoney(trial.balanced)}
                  </>
                )}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">الكود</TableHead>
                    <TableHead>الحساب</TableHead>
                    <TableHead className="text-start">مدين</TableHead>
                    <TableHead className="text-start">دائن</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trial.rows.map((r) => (
                    <TableRow key={r.code} className={r.isGroup ? "bg-muted/40" : undefined}>
                      <TableCell className="tabular text-xs text-muted-foreground">{r.code}</TableCell>
                      <TableCell
                        style={{ paddingInlineStart: `${0.75 + (r.level - 1) * 1.1}rem` }}
                        className={r.isGroup ? "font-semibold" : ""}
                      >
                        {r.name}
                      </TableCell>
                      <TableCell className="tabular text-start">
                        {r.debit ? formatMoney(r.debit) : "—"}
                      </TableCell>
                      <TableCell className="tabular text-start">
                        {r.credit ? formatMoney(r.credit) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell colSpan={2} className="p-3 text-end">
                      الإجمالي
                    </TableCell>
                    <TableCell className="tabular p-3 text-start">{formatMoney(trial.totalDebit)}</TableCell>
                    <TableCell className="tabular p-3 text-start">{formatMoney(trial.totalCredit)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== القوائم المالية ===== */}
        <TabsContent value="statements">
          <div className="mb-3 flex justify-start">
            <PrintReportLink kind="statements" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">قائمة الدخل</CardTitle>
              </CardHeader>
              <CardContent>
                <Line label="إيرادات المبيعات" value={statement.totalRevenue} />
                <Line label="تكلفة البضاعة المباعة" value={-statement.costOfGoods} />
                <Line label="مجمل الربح" value={statement.grossProfit} bold />
                <Line label="المصروفات التشغيلية" value={-statement.operatingExpenses} />
                <Line label="صافي الربح" value={statement.netProfit} bold
                  tone={statement.netProfit >= 0 ? "success" : "destructive"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">قائمة المركز المالي (مختصر)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-1 mt-2 text-xs font-semibold text-muted-foreground">الأصول</p>
                <Line label="أصول متداولة" value={statement.assets.current} />
                <Line label="أصول ثابتة" value={statement.assets.fixed} />
                <Line label="إجمالي الأصول" value={statement.assets.total} bold />

                <p className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">الخصوم وحقوق الملكية</p>
                <Line label="التزامات متداولة" value={statement.liabilities.current} />
                <Line label="إجمالي الالتزامات" value={statement.liabilities.total} bold />
                <Line label="حقوق الملكية" value={statement.equity} />
                <Line
                  label="إجمالي الخصوم وحقوق الملكية"
                  value={round2(statement.liabilities.total + statement.equity)}
                  bold
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== الذمم ===== */}
        <TabsContent value="receivables">
          <div className="mb-3 flex justify-start">
            <PrintReportLink kind="receivables" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <PartyTable title="ذمم العملاء" rows={customers} tone="warning" />
            <PartyTable title="ذمم الموردين" rows={suppliers} tone="info" />
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">تحليل أعمار الذمم — ذمم العملاء (حسب تاريخ الاستحقاق)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {agingRows.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">لا توجد ذمم عملاء مفتوحة.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العميل</TableHead>
                      {agingDefs.map((d) => (
                        <TableHead key={d.key} className="text-left">{d.label}</TableHead>
                      ))}
                      <TableHead className="text-left">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-medium">{r.name}</TableCell>
                        {agingDefs.map((d) => (
                          <TableCell key={d.key} className={`tabular text-left text-sm ${r.cells[d.key] > 0 && d.key === "overdue" ? "font-semibold text-destructive" : ""}`}>
                            {r.cells[d.key] > 0 ? formatMoney(r.cells[d.key]) : "—"}
                          </TableCell>
                        ))}
                        <TableCell className="tabular text-left text-sm font-semibold">{formatMoney(r.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40">
                      <TableCell className="text-sm font-bold">الإجمالي</TableCell>
                      {agingDefs.map((d) => (
                        <TableCell key={d.key} className="tabular text-left text-sm font-bold">
                          {agingTotals[d.key] > 0 ? formatMoney(agingTotals[d.key]) : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="tabular text-left text-sm font-bold">{formatMoney(agingGrand)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
              <p className="p-3 text-xs text-muted-foreground">
                تُصنَّف كل فاتورة غير محصلة كاملة حسب تاريخ الاستحقاق (أو تاريخ الفاتورة إن لم يوجد). «متأخرة» = تجاوزت تاريخ الاستحقاق.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== ملخص القيمة المضافة ===== */}
        <TabsContent value="vat">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                ملخص ضريبة القيمة المضافة — سنة {now.getFullYear()}
              </CardTitle>
              <PrintReportLink kind="vat" />
            </CardHeader>
            <CardContent>
              <Line label="صافي المبيعات الخاضعة للضريبة" value={netSales} />
              <Line label="ضريبة المخرجات (على المبيعات)" value={outputVat} />
              <Line label="ضريبة المدخلات (على المشتريات)" value={-inputVat} />
              <Line
                label="صافي الضريبة المستحقة"
                value={netVat}
                bold
                tone={netVat > 0 ? "destructive" : "success"}
              />
              <p className="mt-4 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
                الأرقام محسوبة من الفواتير والقيود المرحّلة فقط. الإقرار الضريبي الفعلي
                يعتمد على تسويات نهاية الفترة التي تُدخل كقيود يدوية في دفتر اليومية.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                سجل الأصول الثابتة والإهلاك — {now.getFullYear()}
              </CardTitle>
              <PrintReportLink kind="assets" />
            </CardHeader>
            <CardContent className="p-0">
              {assets.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">لا توجد أصول مسجلة.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الرمز</TableHead>
                      <TableHead>الأصل</TableHead>
                      <TableHead>الحساب</TableHead>
                      <TableHead className="text-start">التكلفة</TableHead>
                      <TableHead className="text-start">مجمع الإهلاك</TableHead>
                      <TableHead className="text-start">القيمة الدفترية</TableHead>
                      <TableHead className="text-start">إهلاك السنة</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((a) => {
                      const yearDep = a.depreciations
                        .filter((d) => d.periodYear === now.getFullYear())
                        .reduce((x, d) => x + d.amount, 0);
                      return (
                        <TableRow key={a.id}>
                          <TableCell className="tabular font-medium">{a.code}</TableCell>
                          <TableCell className="text-sm">{a.name}</TableCell>
                          <TableCell className="tabular text-xs text-muted-foreground">{a.account?.code ?? "—"}</TableCell>
                          <TableCell className="tabular text-start">{formatMoney(a.cost)}</TableCell>
                          <TableCell className="tabular text-start">{formatMoney(a.accumulatedDepreciation)}</TableCell>
                          <TableCell className="tabular text-start font-semibold">{formatMoney(round2(a.cost - a.accumulatedDepreciation))}</TableCell>
                          <TableCell className="tabular text-start">{formatMoney(round2(yearDep))}</TableCell>
                          <TableCell>
                            <Badge variant={a.status === "ACTIVE" ? "success" : "muted"}>
                              {a.status === "ACTIVE" ? "نشط" : "مُصرَّف"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={3}>الإجمالي</TableCell>
                      <TableCell className="tabular text-start">{formatMoney(sumMoney(assets.map((a) => a.cost)))}</TableCell>
                      <TableCell className="tabular text-start">{formatMoney(sumMoney(assets.map((a) => a.accumulatedDepreciation)))}</TableCell>
                      <TableCell className="tabular text-start">{formatMoney(sumMoney(assets.map((a) => round2(a.cost - a.accumulatedDepreciation))))}</TableCell>
                      <TableCell className="tabular text-start">
                        {formatMoney(sumMoney(assets.map((a) => a.depreciations.filter((d) => d.periodYear === now.getFullYear()).reduce((x, d) => x + d.amount, 0))))}
                      </TableCell>
                      <TableCell>{`${assets.filter((a) => a.status === "ACTIVE").length} نشط`}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== إغلاق الشهر ===== */}
        <TabsContent value="close">
          <MonthCloseCard userRole={session?.role ?? "viewer"} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        إجمالي ذمم العملاء {formatMoney(receivable)} • إجمالي ذمم الموردين {formatMoney(payable)}
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: number;
  bold?: boolean;
  tone?: "success" | "destructive";
}) {
  return (
    <div
      className={
        bold
          ? "flex items-center justify-between border-t py-1.5 text-sm font-bold"
          : "flex items-center justify-between py-1 text-sm"
      }
    >
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span
        className={
          "tabular " +
          (tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "")
        }
      >
        {formatMoney(Math.abs(value))}
      </span>
    </div>
  );
}

function PartyTable({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { partyId: string; name: string; invoiceTotal: number; paid: number; balance: number }[];
  tone: "warning" | "info";
}) {
  const total = sumMoney(rows.map((r) => r.balance));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">لا توجد أرصدة</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الطرف</TableHead>
                <TableHead className="text-start">إجمالي</TableHead>
                <TableHead className="text-start">سدد</TableHead>
                <TableHead className="text-start">الرصيد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.partyId}>
                  <TableCell className="text-sm">{r.name}</TableCell>
                  <TableCell className="tabular text-start text-sm text-muted-foreground">
                    {formatMoney(r.invoiceTotal)}
                  </TableCell>
                  <TableCell className="tabular text-start text-sm text-muted-foreground">
                    {formatMoney(r.paid)}
                  </TableCell>
                  <TableCell className="tabular text-start font-semibold">
                    {formatMoney(r.balance)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-bold">
                <TableCell className="p-3 text-end" colSpan={3}>
                  الإجمالي
                </TableCell>
                <TableCell className="tabular p-3 text-start">
                  <Badge variant={total > 0 ? tone : "muted"}>{formatMoney(total)}</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
