import { NextRequest } from "next/server";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { getPayrollParams, savePayrollParams } from "@/lib/payroll";

/** معاملات الرواتب: التأمينات + شرائح ضريبة دخل العمالة (admin) */
export async function GET(req: NextRequest) {
  try {
    const admin = requireAdmin(req);
    if (!admin) return fail("صلاحية المدير مطلوبة", 403);
    return ok(await getPayrollParams());
  } catch (e) {
    return handleDbError(e);
  }
}

export async function PUT(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);
  const body = (await req.json().catch(() => null)) as {
    insuranceRate?: number;
    employerInsuranceRate?: number;
    insuranceCeiling?: number;
    whtBrackets?: { upTo: number | null; rate: number }[];
  } | null;
  if (!body) return fail("بدن الطلب غير صالح", 400);
  const insuranceRate = Number(body.insuranceRate);
  const employerInsuranceRate = Number(body.employerInsuranceRate);
  const insuranceCeiling = Number(body.insuranceCeiling);
  if ([insuranceRate, employerInsuranceRate, insuranceCeiling].some((v) => Number.isNaN(v) || v < 0)) {
    return fail("معدلات غير صالحة", 400);
  }
  if (!Array.isArray(body.whtBrackets) || body.whtBrackets.length === 0) {
    return fail("شرائح الضريبة مطلوبة (شريحة واحدة على الأقل)", 400);
  }
  try {
    await savePayrollParams({
      insuranceRate,
      employerInsuranceRate,
      insuranceCeiling,
      whtBrackets: body.whtBrackets.map((b, i, arr) => ({
        upTo: i === arr.length - 1 || b.upTo === null ? Infinity : Number(b.upTo),
        rate: Number(b.rate),
      })),
    });
    await auditLog("UPDATE", "Setting", "payroll", "تحديث معاملات الرواتب", admin);
    return ok(await getPayrollParams());
  } catch (e) {
    return handleDbError(e);
  }
}
