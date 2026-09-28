import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, generateNumber, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { taskSchema } from "./schema";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const companyId = url.searchParams.get("companyId") ?? "";
    const assignedTo = url.searchParams.get("assignedTo") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const priority = url.searchParams.get("priority") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();

    const where = {
      ...(companyId ? { companyId } : {}),
      ...(assignedTo ? { assignedTo } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { taskNumber: { contains: q } }] } : {}),
    };

    const [items, total] = await Promise.all([
      db.officeTask.findMany({
        where,
        include: {
          company: { select: { id: true, nameAr: true } },
          assignedToUser: { select: { id: true, name: true } },
          obligation: { select: { id: true, title: true, dueDate: true } },
        },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }],
        skip,
        take,
      }),
      db.officeTask.count({ where }),
    ]);

    return ok(items, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = taskSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const user = getSessionUser(req);
    const taskNumber = await generateNumber("TASK");
    const created = await db.officeTask.create({ data: { ...parsed.data, taskNumber } });
    await auditLog("CREATE", "OfficeTask", created.id, `إضافة مهمة: ${created.title}`, user?.username);
    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
