import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";

type Ctx = { params: Promise<{ id: string }> };

/** تحديث موظف (بيانات أو راتب أو تفعيل/إيقاف) */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail("بدن الطلب غير صالح", 400);
  try {
    const num = (v: unknown) => (v === undefined ? undefined : Number(v) >= 0 ? Number(v) : NaN);
    const emp = await db.employee.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name) } : {}),
        ...(body.jobTitle !== undefined ? { jobTitle: String(body.jobTitle) || null } : {}),
        ...(body.department !== undefined ? { department: String(body.department) || null } : {}),
        ...(body.nationalId !== undefined ? { nationalId: String(body.nationalId) || null } : {}),
        ...(body.phone !== undefined ? { phone: String(body.phone) || null } : {}),
        ...(body.email !== undefined ? { email: String(body.email) || null } : {}),
        ...(body.basicSalary !== undefined && !Number.isNaN(num(body.basicSalary)!) ? { basicSalary: num(body.basicSalary)! } : {}),
        ...(body.housingAllowance !== undefined && !Number.isNaN(num(body.housingAllowance)!) ? { housingAllowance: num(body.housingAllowance)! } : {}),
        ...(body.transportAllowance !== undefined && !Number.isNaN(num(body.transportAllowance)!) ? { transportAllowance: num(body.transportAllowance)! } : {}),
        ...(body.otherAllowance !== undefined && !Number.isNaN(num(body.otherAllowance)!) ? { otherAllowance: num(body.otherAllowance)! } : {}),
        ...(body.insuranceNumber !== undefined ? { insuranceNumber: String(body.insuranceNumber) || null } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      },
    });
    await auditLog("UPDATE", "Employee", id, `تحديث بيانات موظف: ${emp.name}`);
    return ok(emp);
  } catch (e) {
    if (String(e).includes("Unique constraint")) return fail("الرمز مستخدم", 409);
    return handleDbError(e);
  }
}

/** حذف موظف — للمدير فقط (لا يحذف إن كان مرتبطًا بكشوف رواتب) */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = requireAdmin(_req);
  if (!admin) return fail("الحذف متاح لمدير النظام فقط", 403);
  const { id } = await params;
  try {
    const payslips = await db.payslip.count({ where: { employeeId: id } });
    if (payslips > 0) {
      // لا نحذف من سجل رواتب — نوقفه فقط
      await db.employee.update({ where: { id }, data: { isActive: false } });
      return ok({ deactivated: true, message: "الموظف مرتبط بكشوف رواتب — أُوقف بدل الحذف" });
    }
    const emp = await db.employee.delete({ where: { id } });
    await auditLog("DELETE", "Employee", id, `حذف موظف: ${emp.name}`, admin);
    return ok({ deleted: true });
  } catch (e) {
    return handleDbError(e);
  }
}
