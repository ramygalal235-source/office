import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { auditLog, fail, generateNumber, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { PARTY_TYPES } from "@/lib/domain";
import { partySchema } from "./schema";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const type = url.searchParams.get("type") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();

    const companyId = await requireCompanyId();
    const where = {
      companyId,
      ...(type ? { type } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }, { taxNumber: { contains: q } }] } : {}),
    };

    const [items, total] = await Promise.all([
      db.party.findMany({ where, orderBy: { name: "asc" }, skip, take }),
      db.party.count({ where }),
    ]);

    return ok(items, { page, limit, total, pages: Math.ceil(total / limit), types: PARTY_TYPES });
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = partySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const user = getSessionUser(req);
    const companyId = await requireCompanyId();
    const code = await generateNumber("PARTY");
    const created = await db.party.create({ data: { ...parsed.data, code, companyId } });
    await auditLog("CREATE", "Party", created.id, `إضافة ${created.type === "CUSTOMER" ? "عميل" : "مورد"}: ${created.name}`, user?.username);
    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
