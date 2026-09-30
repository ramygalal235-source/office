import { Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, round2, sumMoney } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { EmployeeForm } from "./employee-form";
import { EmployeeRowActions } from "./employee-row-actions";

export const metadata = { title: "الموظفون | دفاتر المحاسب" };

export default async function EmployeesPage() {
  const session = await getSession();
  const employees = await db.employee.findMany({ orderBy: { code: "asc" } });

  const active = employees.filter((e) => e.isActive);
  const monthlyPayroll = sumMoney(
    active.map((e) => e.basicSalary + e.housingAllowance + e.transportAllowance + e.otherAllowance)
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الموظفون"
        description="ملفات الموظفين ورواتبهم الأساسية والمستحقات — أساس شغل الرواتب الشهري."
        actions={
          <EmployeeForm
            trigger={
              <Button size="sm">
                <Users /> موظف جديد
              </Button>
            }
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="موظفون نشطون" value={`${active.length}`} icon={Users} tone="info" />
        <StatCard label="إجمالي الرواتب الشهرية" value={formatMoney(monthlyPayroll)} hint="أساسي + مستحقات" />
        <StatCard label="متوسط الراتب" value={formatMoney(active.length ? round2(monthlyPayroll / active.length) : 0)} />
        <StatCard label="إجمالي المسجلين" value={`${employees.length}`} />
      </section>

      <Card>
        <CardContent className="p-0">
          {employees.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={Users}
              title="لا يوجد موظفون بعد"
              description="أضف الموظفين براتبهم الأساسي والمستحقات، ثم شغّل الرواتب شهريًا."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرمز</TableHead>
                  <TableHead>الموظف</TableHead>
                  <TableHead>الوظيفة</TableHead>
                  <TableHead className="text-start">الأساسي</TableHead>
                  <TableHead className="text-start">المستحقات</TableHead>
                  <TableHead className="text-start">الإجمالي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => {
                  const allowances = e.housingAllowance + e.transportAllowance + e.otherAllowance;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="tabular font-medium">{e.code}</TableCell>
                      <TableCell className="text-sm">
                        {e.name}
                        {e.department && <span className="block text-[11px] text-muted-foreground">{e.department}</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.jobTitle ?? "—"}</TableCell>
                      <TableCell className="tabular text-start">{formatMoney(e.basicSalary)}</TableCell>
                      <TableCell className="tabular text-start text-sm">{formatMoney(allowances)}</TableCell>
                      <TableCell className="tabular text-start font-semibold">{formatMoney(e.basicSalary + allowances)}</TableCell>
                      <TableCell>
                        <Badge variant={e.isActive ? "success" : "muted"}>{e.isActive ? "نشط" : "موقوف"}</Badge>
                      </TableCell>
                      <TableCell>
                        <EmployeeRowActions
                          id={e.id}
                          name={e.name}
                          isActive={e.isActive}
                          employee={{
                            id: e.id,
                            name: e.name,
                            jobTitle: e.jobTitle,
                            department: e.department,
                            nationalId: e.nationalId,
                            phone: e.phone,
                            email: e.email,
                            basicSalary: e.basicSalary,
                            housingAllowance: e.housingAllowance,
                            transportAllowance: e.transportAllowance,
                            otherAllowance: e.otherAllowance,
                            insuranceNumber: e.insuranceNumber,
                          }}
                          canAct={session?.role !== "viewer"}
                          canDelete={session?.role === "admin"}
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
