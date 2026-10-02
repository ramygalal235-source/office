import { NextRequest } from "next/server";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { payPayrollRun } from "@/lib/payroll";

type Ctx = { params: Promise<{ id: string }> };

/** صرف الصافي من خزينة/بنك (صلاحية المدير) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { safeId?: string } | null;
  if (!body?.safeId) return fail("اختر الخزينة/البنك المصروف منها", 400);
  try {
    const result = await payPayrollRun(id, body.safeId, admin.username);
    await auditLog("PAY", "PayrollRun", id, `صرف رواتب: ${result.journalNumber}`, admin.username);
    return ok(result, { ok: result.ok });
  } catch (e) {
    return handleDbError(e);
  }
}
