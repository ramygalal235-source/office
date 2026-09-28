import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarClock, ListTodo } from "lucide-react";
import { db } from "@/lib/db";
import { dueLabel, formatDate, formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  entityTypeLabel,
  legalFormLabel,
  obligationStatusLabel,
  priorityLabel,
  taskStatusLabel,
} from "@/components/status-badge";
import { OBLIGATION_TYPE_LABELS, TASK_CATEGORY_LABELS } from "@/lib/domain";

export const metadata = { title: "ملف شركة العميل | دفاتر المحاسب" };

type Params = Promise<{ id: string }>;

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

export default async function ClientDetailPage({ params }: { params: Params }) {
  const { id } = await params;

  const company = await db.clientCompany.findUnique({
    where: { id },
    include: {
      obligations: { orderBy: { dueDate: "desc" } },
      tasks: {
        orderBy: { createdAt: "desc" },
        include: { assignedToUser: { select: { name: true } } },
      },
      _count: { select: { invoices: true, purchases: true, documents: true } },
    },
  });

  if (!company) notFound();

  const now = new Date();
  const openObligations = company.obligations.filter((o) =>
    ["PENDING", "IN_PROGRESS", "OVERDUE"].includes(o.status)
  );
  const overdue = openObligations.filter((o) => new Date(o.dueDate) < now);
  const openTasks = company.tasks.filter((t) => !["DONE", "CANCELLED"].includes(t.status));

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/clients">
          <ArrowRight className="size-4" />
          العودة لشركات العملاء
        </Link>
      </Button>

      <PageHeader
        title={company.nameAr}
        description={
          [entityTypeLabel(company.entityType), legalFormLabel(company.legalForm), company.code]
            .filter(Boolean)
            .join(" • ")
        }
        actions={
          <Badge variant={company.isActive ? "success" : "muted"}>
            {company.isActive ? "نشطة" : "موقوفة"}
          </Badge>
        }
      />

      <Tabs defaultValue="file">
        <TabsList>
          <TabsTrigger value="file">الملف الضريبي</TabsTrigger>
          <TabsTrigger value="obligations">
            الالتزامات المفتوحة ({openObligations.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">المهام المفتوحة ({openTasks.length})</TabsTrigger>
        </TabsList>

        {/* ===== الملف الضريبي ===== */}
        <TabsContent value="file">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">بيانات السجل</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="الكود الداخلي" value={<span className="tabular">{company.code}</span>} />
                <InfoRow label="الاسم بالإنجليزية" value={company.nameEn} />
                <InfoRow label="نشاط العمل" value={company.activity} />
                <InfoRow label="الهاتف" value={<span dir="ltr">{company.phone}</span>} />
                <InfoRow label="البريد الإلكتروني" value={company.email} />
                <InfoRow label="المدينة" value={company.city} />
                <InfoRow label="العنوان" value={company.address} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">الملف الضريبي</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="الرقم الضريبي" value={<span className="tabular">{company.taxNumber}</span>} />
                <InfoRow label="رقم ملف الضرائب" value={<span className="tabular">{company.taxFileNumber}</span>} />
                <InfoRow label="مصلحة الضرائب" value={company.taxOffice} />
                <InfoRow label="رقم التسجيل بالقيمة المضافة" value={<span className="tabular">{company.vatRegistrationNumber}</span>} />
                <InfoRow label="مصلحة القيمة المضافة" value={company.vatOffice} />
                <InfoRow label="السجل التجاري" value={<span className="tabular">{company.commercialRegNumber}</span>} />
                <InfoRow label="التأمينات الاجتماعية" value={<span className="tabular">{company.socialInsuranceNumber}</span>} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">المالك والملخص</CardTitle>
              </CardHeader>
              <CardContent>
                <InfoRow label="اسم المالك" value={company.ownerName} />
                <InfoRow label="الرقم القومي" value={<span className="tabular">{company.ownerNationalId}</span>} />
                <InfoRow label="هاتف المالك" value={<span dir="ltr">{company.ownerPhone}</span>} />
                <InfoRow label="الشخص المسؤول" value={company.contactPerson} />
                <InfoRow label="فواتير البيع" value={String(company._count.invoices)} />
                <InfoRow label="فواتير الشراء" value={String(company._count.purchases)} />
                <InfoRow label="ملاحظات" value={company.notes} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== الالتزامات ===== */}
        <TabsContent value="obligations">
          <Card>
            <CardContent className="p-0">
              {company.obligations.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <CalendarClock className="size-8 text-muted-foreground" />
                  <p className="font-medium">لا توجد التزامات مسجلة</p>
                  <p className="text-sm text-muted-foreground">أضف الالتزامات من صفحة الالتزامات الضريبية.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الالتزام</TableHead>
                      <TableHead>النوع</TableHead>
                      <TableHead>الفترة</TableHead>
                      <TableHead>الاستحقاق</TableHead>
                      <TableHead className="text-start">المبلغ</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.obligations.map((o) => {
                      const st = obligationStatusLabel(o.status);
                      const isOpen = ["PENDING", "IN_PROGRESS", "OVERDUE"].includes(o.status);
                      const late = isOpen && new Date(o.dueDate) < now;
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-medium">{o.title}</TableCell>
                          <TableCell className="text-sm">
                            {OBLIGATION_TYPE_LABELS[o.type] ?? o.type}
                          </TableCell>
                          <TableCell className="text-sm">{o.period}</TableCell>
                          <TableCell>
                            <div className="flex flex-col text-sm">
                              <span className="tabular">{formatDate(o.dueDate)}</span>
                              {isOpen && (
                                <span
                                  className={
                                    late ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                                  }
                                >
                                  {dueLabel(o.dueDate)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="tabular text-start">
                            {o.amountDue ? formatMoney(o.amountDue) : "—"}
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
        </TabsContent>

        {/* ===== المهام ===== */}
        <TabsContent value="tasks">
          <Card>
            <CardContent className="p-0">
              {company.tasks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <ListTodo className="size-8 text-muted-foreground" />
                  <p className="font-medium">لا توجد مهام</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المهمة</TableHead>
                      <TableHead>التصنيف</TableHead>
                      <TableHead>المُسندة إلى</TableHead>
                      <TableHead>موعد الإنجاز</TableHead>
                      <TableHead>الأولوية</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.tasks.map((t) => {
                      const st = taskStatusLabel(t.status);
                      const pr = priorityLabel(t.priority);
                      const late =
                        t.dueDate && new Date(t.dueDate) < now && !["DONE", "CANCELLED"].includes(t.status);
                      return (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{t.title}</span>
                              <span className="tabular text-xs text-muted-foreground">{t.taskNumber}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{TASK_CATEGORY_LABELS[t.category] ?? t.category}</TableCell>
                          <TableCell className="text-sm">{t.assignedToUser?.name ?? "غير مُسندة"}</TableCell>
                          <TableCell className={late ? "text-sm text-destructive" : "text-sm"}>
                            {t.dueDate ? formatDate(t.dueDate) : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={pr.variant}>{pr.label}</Badge>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
