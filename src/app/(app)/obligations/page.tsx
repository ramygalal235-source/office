import Link from "next/link";
import { CalendarClock, Search } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dueLabel, formatDate, formatMoney, formatNumber } from "@/lib/money";
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
import { obligationStatusLabel } from "@/components/status-badge";
import { OBLIGATION_TYPE_LABELS } from "@/lib/domain";
import { ObligationForm } from "./obligation-form";
import { ObligationRowActions } from "./obligation-row-actions";

export const metadata = { title: "الالتزامات الضريبية | دفاتر المحاسب" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ObligationsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const scope = typeof sp.scope === "string" ? sp.scope : "";

  const now = new Date();
  const where = {
    ...(q ? { OR: [{ title: { contains: q } }, { period: { contains: q } }] } : {}),
    ...(scope === "overdue"
      ? { dueDate: { lt: now }, status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }
      : scope === "upcoming"
        ? { dueDate: { gte: now }, status: { in: ["PENDING", "IN_PROGRESS"] } }
        : {}),
  };

  const [items, companies, counts] = await Promise.all([
    db.taxObligation.findMany({
      where,
      include: { company: { select: { id: true, nameAr: true, code: true } } },
      orderBy: { dueDate: "asc" },
      take: 200,
    }),
    db.clientCompany.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true, code: true },
      orderBy: { nameAr: "asc" },
    }),
    Promise.all([
      db.taxObligation.count({ where: { dueDate: { lt: now }, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
      db.taxObligation.count({ where: { dueDate: { gte: now }, status: { in: ["PENDING", "IN_PROGRESS"] } } }),
      db.taxObligation.count(),
    ]),
  ]);

  const [overdueCount, upcomingCount, totalCount] = counts;
  const isAdmin = session?.role === "admin";

  const scopeLink = (value: string, label: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value) params.set("scope", value);
    const qs = params.toString();
    return (
      <Link
        href={qs ? `/obligations?${qs}` : "/obligations"}
        className={
          scope === value
            ? "rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            : "rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الالتزامات الضريبية"
        description="تواريخ سداد الإقرارات والالتزامات لكل شركة عميل."
        actions={<ObligationForm companies={companies} />}
      />

      <div className="flex flex-wrap items-center gap-1">
        {scopeLink("", `الكل (${totalCount})`)}
        {scopeLink("overdue", `متأخرة (${overdueCount})`)}
        {scopeLink("upcoming", `قادمة (${upcomingCount})`)}
      </div>

      <form className="relative max-w-sm" action="/obligations">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="بحث في العنوان أو الفترة..." className="ps-9" />
      </form>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={CalendarClock}
              title="لا توجد التزامات"
              description="لم يتم تسجيل أي التزام ضريبي مطابق للبحث."
              action={<ObligationForm companies={companies} />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الالتزام</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>شركة العميل</TableHead>
                  <TableHead>الاستحقاق</TableHead>
                  <TableHead className="text-start">المبلغ</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((o) => {
                  const st = obligationStatusLabel(o.status);
                  const due = new Date(o.dueDate);
                  const isLate = due < now && !["PAID", "FILED", "WAIVED"].includes(o.status);
                  return (
                    <TableRow key={o.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <Link
                            href={`/clients/${o.companyId}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {o.title}
                          </Link>
                          <span className="text-xs text-muted-foreground">{o.period}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {OBLIGATION_TYPE_LABELS[o.type] ?? o.type}
                      </TableCell>
                      <TableCell className="text-sm">
                        {o.company ? (
                          <Link href={`/clients/${o.companyId}`} className="hover:text-primary hover:underline">
                            {o.company.nameAr}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-sm">
                          <span className="tabular">{formatDate(o.dueDate)}</span>
                          <span className={isLate ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                            {dueLabel(o.dueDate)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="tabular text-start font-medium">
                        {o.amountDue ? formatMoney(o.amountDue) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <ObligationRowActions
                          id={o.id}
                          status={o.status}
                          title={o.title}
                          canDelete={isAdmin}
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

      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          إجمالي {formatNumber(totalCount, 0)} التزام — المعروض {formatNumber(items.length, 0)}
        </p>
      )}
    </div>
  );
}
