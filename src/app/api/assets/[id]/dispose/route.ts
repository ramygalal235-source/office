import { NextRequest } from "next/server";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { disposeAsset } from "@/lib/assets";

type Ctx = { params: Promise<{ id: string }> };

/** صرف/إتلاف أصل — صلاحية المدير */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);
  const { id } = await params;
  try {
    const result = await disposeAsset(id, new Date(), admin);
    await auditLog("DISPOSE", "FixedAsset", id, result.message, admin);
    return ok(result, { ok: result.ok });
  } catch (e) {
    return handleDbError(e);
  }
}
