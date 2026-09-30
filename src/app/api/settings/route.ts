import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/accounting/constants";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = () => process.env.DAFATIR_DATA_DIR ?? process.cwd();

async function upsertSetting(key: string, value: string, label?: string) {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value, label },
  });
}

/** إعدادات المكتب العامة (قراءة للجميع) */
export async function GET() {
  try {
    const rows = await db.setting.findMany({ where: { key: { in: ["office.name", "office.subtitle"] } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
    const pendingRestore = fs.existsSync(path.join(DATA_DIR(), "db", "pending-restore.zip"));
    return ok({
      office: { name: get("office.name") || BRAND.name, subtitle: get("office.subtitle") || BRAND.subtitle },
      pendingRestore,
    });
  } catch (e) {
    return handleDbError(e);
  }
}

/** تحديث بيانات المكتب (admin) */
export async function PUT(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);

  const body = (await req.json().catch(() => null)) as { name?: string; subtitle?: string } | null;
  if (!body) return fail("بدن الطلب غير صالح", 400);

  try {
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 80) return fail("اسم المكتب: 2-80 حرفًا", 400);
      await upsertSetting("office.name", name, "اسم المكتب");
    }
    if (body.subtitle !== undefined) {
      const subtitle = String(body.subtitle).trim();
      if (subtitle.length > 120) return fail("الوصف: 120 حرفًا كحد أقصى", 400);
      await upsertSetting("office.subtitle", subtitle, "وصف المكتب");
    }
    await auditLog("UPDATE", "Setting", "office", "تحديث بيانات المكتب", admin.username);
    return ok({ saved: true });
  } catch (e) {
    return handleDbError(e);
  }
}
