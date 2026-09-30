import { NextRequest } from "next/server";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { postAssetAcquisition } from "@/lib/assets";

type Ctx = { params: Promise<{ id: string }> };

/** ترحيل قيد الاستحواذ (مدين الأصل — دائن الخزينة/البنك) — للمدير */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة لترحيل الاستحواذ", 403);
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { safeId?: string } | null;
  if (!body?.safeId) return fail("اختر الخزينة/البنك الممول", 400);
  try {
    const result = await postAssetAcquisition(id, body.safeId, admin);
    await auditLog("POST", "FixedAsset", id, `ترحيل قيد استحواذ: ${result.message ?? ""}`, admin);
    return ok(result, { ok: result.ok });
  } catch (e) {
    return handleDbError(e);
  }
}
