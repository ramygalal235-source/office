import { NextRequest } from "next/server";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { depreciateAsset } from "@/lib/assets";

type Ctx = { params: Promise<{ id: string }> };

/** إهلاك أصل عن فترة (سنة/شهر) — صلاحية المدير (قيد يومية) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة لترحيل الإهلاك", 403);
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { year?: number; month?: number } | null;
  const year = Number(body?.year);
  const month = Number(body?.month);
  if (!year || !month || month < 1 || month > 12) return fail("حدد سنة وشهر الإهلاك", 400);
  try {
    const result = await depreciateAsset(id, year, month, admin.username);
    if (!result.ok) return fail(result.message, 400);
    await auditLog("DEPRECIATE", "FixedAsset", id, result.message, admin.username);
    return ok(result, { ok: result.ok });
  } catch (e) {
    return handleDbError(e);
  }
}
