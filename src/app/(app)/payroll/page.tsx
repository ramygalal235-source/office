import { Banknote, Coins } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { formatMoney, sumMoney } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { NewRunDialog, RunRowActions } from "./payroll-run-dialog";
import { PayrollParamsCard } from "./payroll-params-card";

export const metadata = { title: "الرواتب | دفاتر المحاسب" };

const STATUS_LABELS: Record<string, { label: string; variant: "muted" | "info" | "success" | "warning" }> = {
  DRAFT: { label: "مسودة", variant: "muted" },
  POSTED: { label: "مرحّلة", variant: "success" },
};

export default async function PayrollPage() {
  const session = await getSession();
  const companyId = await requireCompanyId();
  const [runs, safes, employeesCount] = await Promise.all([
    db.payrollRun.findMany({
      where: { companyId },
      include: { payslips: { include: { employee: { select: { name: true, code: true } } } } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      take: 12,
    }),
    db.safe.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    db.employee.count({ where: { companyId, isActive: true } }),
  ]);

  const now = new Date();
  const totalNet = sumMoney(runs.map((r) => r.totalNet));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الرواتب"
        description={`شغل الرواتب الشهري: حساب التأمينات وضريبة الدخل بالشرائح، ترحيل قيود، وصرف من الخزينة — ${employeesCount} موظفًا نشطًا.`}
        actions={
          session?.role === "admin" ? (
            <NewRunDialog
              defaultYear={now.getFullYear()}
              defaultMonth={now.getMonth() + 1}
            />
          ) : undefined
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="شغل رواتب" value={`${runs.length}`} icon={Banknote} />
        <StatCard label="صافي مدفوع (آخر 12 شغل)" value={formatMoney(totalNet)} icon={Coins} tone="info" />
        <StatCard label="الموظفون النشطون" value={`${employeesCount}`} />
        <StatCard label="الشهر الحالي" value={`${now.getMonth() + 1}/${now.getFullYear()}`} tone="success" />
      </section>

      {session?.role === "admin" && <PayrollParamsCard />}

      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={Banknote}
              title="لا توجد شغل رواتب بعد"
              description="أنشئ شغل رواتب للشهر — يُحسب تلقائيًا لكل موظف نشط (تأمينات + ضريبة + صافي)."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفترة</TableHead>
                  <TableHead>الموظفون</TableHead>
                  <TableHead className="text-start">المصروف الكلي</TableHead>
                  <TableHead className="text-start">الخصومات</TableHead>
                  <TableHead className="text-start">الصافي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الصرف</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const st = STATUS_LABELS[r.status] ?? STATUS_LABELS.DRAFT;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="tabular font-medium">{r.periodMonth}/{r.periodYear}</TableCell>
                      <TableCell className="text-sm">{r.payslips.length} موظف</TableCell>
                      <TableCell className="tabular text-start font-semibold">{formatMoney(r.totalGross)}</TableCell>
                      <TableCell className="tabular text-start text-sm">{formatMoney(r.totalDeductions)}</TableCell>
                      <TableCell className="tabular text-start font-semibold">{formatMoney(r.totalNet)}</TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.paidAt ? (
                          <Badge variant="muted">مُصروف</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <RunRowActions
                          id={r.id}
                          status={r.status}
                          paidAt={r.paidAt ? r.paidAt.toISOString() : null}
                          totalNet={r.totalNet}
                          payslips={r.payslips.map((p) => ({
                            employeeName: p.employee.name,
                            basic: p.basic,
                            allowances: p.allowances,
                            overtime: p.overtime,
                            bonuses: p.bonuses,
                            insurance: p.insurance,
                            tax: p.tax,
                            otherDeductions: p.otherDeductions,
                            net: p.net,
                          }))}
                          safes={safes.map((s) => ({ id: s.id, label: `${s.name} (${s.type === "BANK" ? "بنك" : "خزينة"})` }))}
                          isAdmin={session?.role === "admin"}
                        />
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
  );
}
