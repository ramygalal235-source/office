import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EngagementsBoard, type BoardEngagement } from "@/components/engagements-board";

export const dynamic = "force-dynamic";

export default async function EngagementsPage() {
  const user = await getSession();
  if (!user) return null;

  const [engagements, clients, services, users, taskTotals, taskDones] = await Promise.all([
    db.engagement.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, nameAr: true } },
        service: { select: { id: true, name: true, code: true, slaDays: true, defaultFee: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
      },
    }),
    db.clientCompany.findMany({
      where: { isActive: true },
      select: { id: true, nameAr: true },
      orderBy: { nameAr: "asc" },
    }),
    db.serviceType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.officeTask.groupBy({ by: ["engagementId"], where: { engagementId: { not: null } }, _count: { _all: true } }),
    db.officeTask.groupBy({ by: ["engagementId"], where: { engagementId: { not: null }, status: "DONE" }, _count: { _all: true } }),
  ]);

  const totalBy = new Map(taskTotals.map((t) => [t.engagementId, t._count._all]));
  const doneBy = new Map(taskDones.map((t) => [t.engagementId, t._count._all]));

  const rows: BoardEngagement[] = engagements.map((e) => ({
    id: e.id,
    code: e.code,
    title: e.title,
    status: e.status,
    periodYear: e.periodYear,
    periodMonth: e.periodMonth,
    clientId: e.clientId,
    clientName: e.client?.nameAr ?? null,
    service: { id: e.service.id, name: e.service.name, code: e.service.code, slaDays: e.service.slaDays, defaultFee: e.service.defaultFee },
    feeAmount: e.feeAmount,
    currency: e.currency,
    startDate: e.startDate ? e.startDate.toISOString() : null,
    dueDate: e.dueDate ? e.dueDate.toISOString() : null,
    closedAt: e.closedAt ? e.closedAt.toISOString() : null,
    members: e.members.map((m) => ({ userId: m.userId, name: m.user.name, role: m.role, allocationPct: m.allocationPct })),
    tasksTotal: totalBy.get(e.id) ?? 0,
    tasksDone: doneBy.get(e.id) ?? 0,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="ملفات العمل"
        description="كل ملف = عميل × خدمة × فترة مالية. إنشاء الملف يولّد قائمة المهام آليًا من قوالب الخدمة بالتواريخ المحسوبة، ويُراقب SLA بعد ذلك عبر الأتمتة."
      />
      <EngagementsBoard
        initialEngagements={rows}
        clients={clients}
        services={services.map((s) => ({ id: s.id, name: s.name, code: s.code, slaDays: s.slaDays, defaultFee: s.defaultFee, billingType: s.billingType }))}
        users={users}
        userRole={user.role}
      />
    </>
  );
}
