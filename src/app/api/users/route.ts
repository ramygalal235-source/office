import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { ROLES } from "@/lib/auth";

const LIST_FIELDS = {
  id: true,
  username: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  accessAllCompanies: true,
  lastLogin: true,
  createdAt: true,
} as const;

/** قائمة المستخدمين (admin) */
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return fail("صلاحية المدير مطلوبة", 403);
  try {
    const users = await db.user.findMany({
      select: LIST_FIELDS,
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });
    return ok({ users });
  } catch (e) {
    return handleDbError(e);
  }
}

/** إنشاء مستخدم جديد (admin) */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);

  const body = (await req.json().catch(() => null)) as {
    username?: string;
    name?: string;
    password?: string;
    role?: string;
    email?: string;
    phone?: string;
  } | null;

  const username = String(body?.username ?? "").trim().toLowerCase();
  const name = String(body?.name ?? "").trim();
  const password = String(body?.password ?? "");
  const role = typeof body?.role === "string" && (ROLES as readonly string[]).includes(body.role) ? (body.role as string) : "accountant";

  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) return fail("اسم المستخدم: 3-32 حرفًا (لاتيني/أرقام/._-)", 400);
  if (name.length < 2) return fail("الاسم مطلوب", 400);
  if (password.length < 6) return fail("كلمة المرور: 6 أحرف على الأقل", 400);

  try {
    const existing = await db.user.findUnique({ where: { username } });
    if (existing) return fail("اسم المستخدم مستخدم بالفعل", 409);

    const user = await db.user.create({
      data: {
        username,
        name,
        passwordHash: await hashPassword(password),
        role,
        email: body?.email?.trim() || null,
        phone: body?.phone?.trim() || null,
      },
    });

    await auditLog("CREATE", "User", user.id, `إنشاء مستخدم ${username} (${role})`, admin.username);
    return ok({ id: user.id });
  } catch (e) {
    return handleDbError(e);
  }
}
