import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { entityTypeLabel, legalFormLabel, obligationStatusLabel } from "@/components/status-badge";
import { dueLabel, formatDate } from "@/lib/money";
import { CompanyForm } from "./company-form";

export const metadata = { title: "شركات العملاء | دفاتر المحاسب" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";

  const where = q
    ? {
        OR: [
          { nameAr: { contains: q } },
          { nameEn: { contains: q } },
          { code: { contains: q } },
          { taxNumber: { contains: q } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    db.clientCompany.findMany({
      where,
      include: {
        _count: { select: { obligations: true, tasks: true, invoices: true, purchases: true } },
        obligations: {
          where: { status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } },
          orderBy: { dueDate: "asc" },
          take: 1,
          select: { id: true, title: true, dueDate: true, status: true },
        },
      },
      orderBy: { nameAr: "asc" },
      take: 200,
    }),
    db.clientCompany.count({ where }),
  ]);

  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="شركات العملاء"
        description="ملفات العملاء والالتزامات الضريبية التابعة لكل ملف."
        actions={<CompanyForm />}
      />

      <form className="relative max-w-sm" action="/clients">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="بحث بالاسم أو الكود أو الرقم الضريبي..." className="ps-9" />
      </form>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={Building2}
              title="لا توجد شركات"
              description="ابدأ بإضافة أول شركة عميل لتتمكن من تسجيل التزاماتها الضريبية."
              action={<CompanyForm />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الشركة</TableHead>
                  <TableHead>الصفة</TableHead>
                  <TableHead>الرقم الضريبي</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>أقرب التزام</TableHead>
                  <TableHead className="text-center">الالتزامات</TableHead>
                  <TableHead className="text-center">المهام</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => {
                  const next = c.obligations[0];
                  const late = next ? new Date(next.dueDate) < now : false;
                  const st = next ? obligationStatusLabel(next.status) : null;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <Link href={`/clients/${c.id}`} className="font-medium hover:text-primary hover:underline">
                            {c.nameAr}
                          </Link>
                          <span className="tabular text-xs text-muted-foreground">{c.code}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span>{entityTypeLabel(c.entityType)}</span>
                          <span className="text-xs text-muted-foreground">{legalFormLabel(c.legalForm)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="tabular text-sm">{c.taxNumber ?? "—"}</TableCell>
                      <TableCell className="tabular text-sm" dir="ltr">
                        {c.phone ?? "—"}
                      </TableCell>
                      <TableCell>
                        {next ? (
                          <div className="flex flex-col">
                            <span className="text-sm">{next.title}</span>
                            <span
                              className={
                                late ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                              }
                            >
                              {formatDate(next.dueDate)} • {dueLabel(next.dueDate)}
                            </span>
                            {st && (
                              <Badge variant={st.variant} className="mt-1 w-fit">
                                {st.label}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">لا يوجد</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-center">{c._count.obligations}</TableCell>
                      <TableCell className="tabular text-center">{c._count.tasks}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        إجمالي {total} شركة
      </p>
    </div>
  );
}
