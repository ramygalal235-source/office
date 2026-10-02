import { NextRequest } from "next/server";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { disposeAsset } from "@/lib/assets";

type Ctx = { params: Promise<{ id: string }> };

/** صرف/إتلاف أصل — صلاحية المدير */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { proceeds?: number; safeId?: string } | null;
  try {
    const result = await disposeAsset(
      id,
      {
        date: new Date(),
        proceeds: body?.proceeds ? Number(body.proceeds) : 0,
        safeId: body?.safeId ?? undefined,
      },
      admin.username
    );
    await auditLog("DISPOSE", "FixedAsset", id, result.message, admin.username);
    return ok(result, { ok: result.ok });
  } catch (e) {
    return handleDbError(e);
  }
}
