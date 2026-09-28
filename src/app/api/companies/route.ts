import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { companySchema } from "./schema";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const status = url.searchParams.get("status") ?? "";

    const where = {
      ...(q
        ? {
            OR: [
              { nameAr: { contains: q } },
              { nameEn: { contains: q } },
              { code: { contains: q } },
              { taxNumber: { contains: q } },
            ],
          }
        : {}),
      ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
    };

    const [items, total] = await Promise.all([
      db.clientCompany.findMany({
        where,
        include: { _count: { select: { obligations: true, tasks: true, invoices: true } } },
        orderBy: { nameAr: "asc" },
        skip,
        take,
      }),
      db.clientCompany.count({ where }),
    ]);

    return ok(items, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = companySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const data = parsed.data;
    const user = getSessionUser(req);

    const last = await db.clientCompany.findFirst({ orderBy: { code: "desc" }, select: { code: true } });
    const nextNum = last?.code?.match(/(\d+)$/)?.[1]
      ? Number(last.code.match(/(\d+)$/)![1]) + 1
      : 1;
    const code = data.code || `C-${String(nextNum).padStart(4, "0")}`;

    const created = await db.clientCompany.create({ data: { ...data, code } });
    await auditLog("CREATE", "ClientCompany", created.id, `إضافة شركة العميل ${created.nameAr}`, user?.username);

    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
