import Link from "next/link";
import { ListTodo, Search } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { dueLabel, formatDate } from "@/lib/money";
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
import { priorityLabel, taskStatusLabel } from "@/components/status-badge";
import { TASK_CATEGORY_LABELS } from "@/lib/domain";
import { TaskForm } from "./task-form";
import { TaskRowActions } from "./task-row-actions";

export const metadata = { title: "المهام | دفاتر المحاسب" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const scope = typeof sp.scope === "string" ? sp.scope : "";
  const now = new Date();

  const where = {
    ...(q ? { OR: [{ title: { contains: q } }, { taskNumber: { contains: q } }] } : {}),
    ...(scope === "mine" ? { assignedTo: session?.uid ?? "" } : {}),
    ...(scope === "open" ? { status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } } : {}),
    ...(scope === "done" ? { status: "DONE" } : {}),
  };

  const [items, companies, users, counts] = await Promise.all([
    db.officeTask.findMany({
      where,
      include: {
        company: { select: { id: true, nameAr: true } },
        assignedToUser: { select: { id: true, name: true } },
        obligation: { select: { id: true, title: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 200,
    }),
    db.clientCompany.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true },
      orderBy: { nameAr: "asc" },
    }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    Promise.all([
      db.officeTask.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "REVIEW"] } } }),
      db.officeTask.count({ where: { status: "DONE" } }),
      db.officeTask.count(),
    ]),
  ]);

  const [openCount, doneCount, totalCount] = counts;
  const isAdmin = session?.role === "admin";

  const scopeLink = (value: string, label: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value) params.set("scope", value);
    const qs = params.toString();
    return (
      <Link
        href={qs ? `/tasks?${qs}` : "/tasks"}
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
        title="المهام المُسندة"
        description="توزيع أعمال المكتب ومتابعة إنجازها."
        actions={<TaskForm companies={companies} users={users} />}
      />

      <div className="flex flex-wrap items-center gap-1">
        {scopeLink("", `الكل (${totalCount})`)}
        {scopeLink("open", `مفتوحة (${openCount})`)}
        {scopeLink("mine", "مهامي")}
        {scopeLink("done", `مكتملة (${doneCount})`)}
      </div>

      <form className="relative max-w-sm" action="/tasks">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder="بحث في العنوان أو رقم المهمة..." className="ps-9" />
      </form>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={ListTodo}
              title="لا توجد مهام"
              description="لم يتم تسجيل أي مهمة مطابقة للبحث."
              action={<TaskForm companies={companies} users={users} />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المهمة</TableHead>
                  <TableHead>شركة العميل</TableHead>
                  <TableHead>المُسندة إلى</TableHead>
                  <TableHead>موعد الإنجاز</TableHead>
                  <TableHead>الأولوية</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => {
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
                      <TableCell className="text-sm">
                        {t.company ? (
                          <Link href={`/clients/${t.companyId}`} className="hover:text-primary hover:underline">
                            {t.company.nameAr}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.assignedToUser?.name ?? <span className="text-muted-foreground">غير مُسندة</span>}
                      </TableCell>
                      <TableCell>
                        {t.dueDate ? (
                          <div className="flex flex-col text-sm">
                            <span className="tabular">{formatDate(t.dueDate)}</span>
                            <span className={late ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                              {dueLabel(t.dueDate)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pr.variant}>{pr.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <TaskRowActions
                          id={t.id}
                          status={t.status}
                          title={t.title}
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
    </div>
  );
}
