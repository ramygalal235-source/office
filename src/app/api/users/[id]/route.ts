import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * تحديث مستخدم (admin): الدور، التفعيل، البيانات، إعادة تعيين كلمة المرور.
 * حارس أخيرة: لا يمكن تعطيل أو إنقاص دور المدير النشط الوحيد —
 * حتى لا يُقفل النظام على نفسه.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
    role?: string;
    isActive?: boolean;
    accessAllCompanies?: boolean;
    password?: string;
  } | null;
  if (!body) return fail("بدن الطلب غير صالح", 400);

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return fail("المستخدم غير موجود", 404);

  const role = body.role !== undefined ? body.role : target.role;
  const isActive = body.isActive !== undefined ? body.isActive : target.isActive;

  // حارس المدير الأخير
  const demotesLastAdmin =
    target.role === "admin" && target.isActive && (role !== "admin" || isActive === false);
  if (demotesLastAdmin) {
    const otherAdmins = await db.user.count({
      where: { role: "admin", isActive: true, id: { not: id } },
    });
    if (otherAdmins === 0) {
      return fail("لا يمكن إزالة آخر مدير نشط في النظام — أنشئ مديرًا آخر أولًا", 409);
    }
  }

  if (body.password !== undefined && String(body.password).length < 6) {
    return fail("كلمة المرور: 6 أحرف على الأقل", 400);
  }

  try {
    const user = await db.user.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() || target.name } : {}),
        ...(body.email !== undefined ? { email: body.email?.trim() || null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
        ...(body.role !== undefined ? { role } : {}),
        ...(body.isActive !== undefined ? { isActive } : {}),
        ...(body.accessAllCompanies !== undefined ? { accessAllCompanies: body.accessAllCompanies } : {}),
        ...(body.password ? { passwordHash: await hashPassword(String(body.password)) } : {}),
      },
    });

    const parts: string[] = [];
    if (body.role !== undefined && body.role !== target.role) parts.push(`الدور → ${role}`);
    if (body.isActive !== undefined && body.isActive !== target.isActive) parts.push(isActive ? "تفعيل" : "تعطيل");
    if (body.password) parts.push("إعادة تعيين كلمة المرور");
    if (parts.length === 0) parts.push("تحديث بيانات");

    await auditLog("UPDATE", "User", id, `تعديل ${target.username}: ${parts.join("، ")}`, admin.username);
    return ok({ id: user.id });
  } catch (e) {
    return handleDbError(e);
  }
}
