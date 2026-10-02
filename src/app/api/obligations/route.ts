import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { obligationSchema } from "./schema";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const companyId = url.searchParams.get("companyId") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();
    const scope = url.searchParams.get("scope") ?? ""; // overdue | upcoming | all

    const now = new Date();
    const where = {
      ...(companyId ? { companyId } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ title: { contains: q } }, { period: { contains: q } }] } : {}),
      ...(scope === "overdue"
        ? { dueDate: { lt: now }, status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } }
        : scope === "upcoming"
          ? { dueDate: { gte: now }, status: { in: ["PENDING", "IN_PROGRESS"] } }
          : {}),
    };

    const [items, total] = await Promise.all([
      db.taxObligation.findMany({
        where,
        include: { company: { select: { id: true, nameAr: true, code: true } } },
        orderBy: { dueDate: "asc" },
        skip,
        take,
      }),
      db.taxObligation.count({ where }),
    ]);

    return ok(items, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = obligationSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const user = getSessionUser(req);
    const created = await db.taxObligation.create({ data: parsed.data });
    await auditLog("CREATE", "TaxObligation", created.id, `إضافة التزام: ${created.title}`, user?.username);
    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
