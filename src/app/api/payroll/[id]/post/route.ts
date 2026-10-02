import { NextRequest } from "next/server";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { postPayrollRun } from "@/lib/payroll";

type Ctx = { params: Promise<{ id: string }> };

/** ترحيل شغل الرواتب إلى قيود اليومية (صلاحية المدير) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);
  const { id } = await params;
  try {
    const result = await postPayrollRun(id, admin.username);
    await auditLog("POST", "PayrollRun", id, `ترحيل رواتب: ${result.message ?? result.journalNumber ?? ""}`, admin.username);
    return ok(result, { ok: result.ok });
  } catch (e) {
    return handleDbError(e);
  }
}
