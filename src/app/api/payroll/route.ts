import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { requireCompanyId } from "@/lib/company-context";
import { runPayroll } from "@/lib/payroll";

/** كشف شغل الرواتب (الأحدث أولًا) — لشركة النطاق النشطة */
export async function GET() {
  try {
    const companyId = await requireCompanyId();
    const runs = await db.payrollRun.findMany({
      where: { companyId },
      include: { payslips: { include: { employee: { select: { name: true, code: true } } } } },
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      take: 24,
    });
    return ok(runs);
  } catch (e) {
    return handleDbError(e);
  }
}

/** إنشاء شغل رواتب لفترة (صلاحية المدير) */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة لشغل الرواتب", 403);
  const body = (await req.json().catch(() => null)) as { year?: number; month?: number } | null;
  const year = Number(body?.year);
  const month = Number(body?.month);
  if (!year || !month || month < 1 || month > 12) return fail("حدد سنة وشهر شغل الرواتب", 400);
  try {
    const companyId = await requireCompanyId();
    const run = await runPayroll(year, month, admin.username, companyId);
    await auditLog("CREATE", "PayrollRun", run.id, `شغل رواتب ${month}/${year}`, admin.username);
    return ok(run, { ok: true });
  } catch (e) {
    if (e instanceof Error && /توجد شغل رواتب/.test(e.message)) return fail(e.message, 409);
    return handleDbError(e);
  }
}
