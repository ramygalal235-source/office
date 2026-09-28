import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, generateNumber, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const status = url.searchParams.get("status") ?? "";
    const clientId = url.searchParams.get("clientId") ?? "";
    const serviceId = url.searchParams.get("serviceId") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();

    const where = {
      ...(status ? { status } : {}),
      ...(clientId ? { clientId } : {}),
      ...(serviceId ? { serviceId } : {}),
      ...(q ? { code: { contains: q } } : {}),
    };

    const [items, total, taskTotals, taskDones] = await Promise.all([
      db.engagement.findMany({
        where,
        include: {
          client: { select: { id: true, nameAr: true } },
          service: { select: { id: true, name: true, slaDays: true, code: true } },
          members: { include: { user: { select: { id: true, name: true } } } },
          _count: { select: { tasks: true, times: true, documents: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.engagement.count({ where }),
      db.officeTask.groupBy({ by: ["engagementId"], where: { engagementId: { not: null } }, _count: { _all: true } }),
      db.officeTask.groupBy({ by: ["engagementId"], where: { engagementId: { not: null }, status: "DONE" }, _count: { _all: true } }),
    ]);

    const totalBy = new Map(taskTotals.map((t) => [t.engagementId, t._count._all]));
    const doneBy = new Map(taskDones.map((t) => [t.engagementId, t._count._all]));
    const withProgress = items.map((e) => ({
      ...e,
      tasksTotal: totalBy.get(e.id) ?? 0,
      tasksDone: doneBy.get(e.id) ?? 0,
    }));

    return ok(withProgress, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) {
    return handleDbError(e);
  }
}

const memberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["LEAD", "REVIEWER", "MEMBER"]).default("MEMBER"),
  allocationPct: z.number().min(0).max(100).default(0),
});

const createSchema = z.object({
  clientId: z.string().min(1),
  serviceId: z.string().min(1),
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12).nullable().optional(),
  title: z.string().min(2).max(200),
  feeAmount: z.number().min(0).default(0),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  members: z.array(memberSchema).max(10).default([]),
});

/**
 * إنشاء ملف عمل: العميل × الخدمة × الفترة المالية.
 * بمجرد التسجيل، يسلك ملف العمل سلسلة الأتمتة:
 * auditLog → حدث engagement.created → قاعدة engagement.checklist →
 * مهمة engagement.generate_checklist → توليد المهام من قوالب الخدمة
 * بالتواريخ المحسوبة من إزاحة كل قالب (offsetDays).
 */
export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const d = parsed.data;

    const client = await db.clientCompany.findUnique({ where: { id: d.clientId } });
    if (!client) return fail("عميل غير موجود", 404);
    const service = await db.serviceType.findUnique({ where: { id: d.serviceId } });
    if (!service) return fail("نوع خدمة غير موجود", 404);

    const month = d.periodMonth ?? null;
    const existing = await db.engagement.findUnique({
      where: { clientId_serviceId_periodYear_periodMonth: { clientId: d.clientId, serviceId: d.serviceId, periodYear: d.periodYear, periodMonth: month } },
    });
    if (existing) return fail(`يوجد ملف عمل بالفعل لنفس العميل والخدمة والفترة: ${existing.code}`, 409);

    // موعد الاستحقاق الافتراضي: بداية الفترة + مدة الخدمة (SLA)
    const periodStart = new Date(Date.UTC(d.periodYear, (month ?? 1) - 1, 1));
    const dueDate = d.dueDate ? new Date(d.dueDate) : new Date(periodStart.getTime() + service.slaDays * 86400000);
    const startDate = d.startDate ? new Date(d.startDate) : periodStart;

    const engagement = await db.engagement.create({
      data: {
        code: await generateNumber("ENGAGEMENT"),
        clientId: d.clientId,
        serviceId: d.serviceId,
        periodYear: d.periodYear,
        periodMonth: month,
        title: d.title,
        status: "ACTIVE",
        feeAmount: d.feeAmount,
        startDate,
        dueDate,
        notes: d.notes || null,
        members: {
          create: d.members.map((m) => ({
            userId: m.userId,
            role: m.role,
            allocationPct: m.allocationPct,
          })),
        },
      },
    });

    // الحدث يطلق توليد قائمة المهام آليًا عبر قاعدة engagement.checklist
    await auditLog("CREATE", "Engagement", engagement.id, `إنشاء ملف عمل ${engagement.code} — ${client.nameAr} (${service.name})`, user?.username);

    return ok({ engagement });
  } catch (e) {
    return handleDbError(e);
  }
}
