import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue, optText } from "@/lib/validators";
import { ACCOUNT_TYPES } from "@/lib/accounting/constants";

const accountSchema = z.object({
  code: optText(20),
  name: z.string().trim().min(1, "اسم الحساب مطلوب").max(200),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]),
  parentId: optText(30),
  isGroup: z.union([z.boolean(), z.string()]).optional().transform((v) => v === true || v === "true"),
  isActive: z.union([z.boolean(), z.string()]).optional().transform((v) => v !== false && v !== "false"),
});

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const type = url.searchParams.get("type") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();
    const onlyLeaves = url.searchParams.get("leaves") === "1";

    const where = {
      ...(type ? { type } : {}),
      ...(q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : {}),
      ...(onlyLeaves ? { isGroup: false, isActive: true } : {}),
    };

    const [items, total] = await Promise.all([
      db.account.findMany({ where, orderBy: { code: "asc" }, skip, take }),
      db.account.count({ where }),
    ]);

    return ok(items, { page, limit, total, pages: Math.ceil(total / limit), types: ACCOUNT_TYPES });
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = accountSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { name, type, parentId, isGroup } = parsed.data;
    if (!name) return fail("اسم الحساب مطلوب", 400);

    const user = getSessionUser(req);
    // كود تلقائي إن لم يُحدَّد: نولّد من آخر حساب + 1
    const last = await db.account.findFirst({ orderBy: { code: "desc" }, select: { code: true } });
    const code =
      parsed.data.code ||
      String((Number(last?.code?.match(/(\d+)$/)?.[1] ?? 0) + 1)).padStart(4, "0");

    const level = parentId
      ? (await db.account.findUnique({ where: { id: parentId }, select: { level: true } }))?.level ?? 0
      : 0;

    const created = await db.account.create({
      data: {
        code,
        name,
        type,
        parentId: parentId || null,
        isGroup,
        level: level + 1,
        isActive: parsed.data.isActive,
        isSystem: false,
      },
    });
    await auditLog("CREATE", "Account", created.id, `إضافة حساب ${created.code} — ${created.name}`, user?.username);
    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
