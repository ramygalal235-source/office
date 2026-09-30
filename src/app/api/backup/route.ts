import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { auditLog, fail, getSessionUser, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { createBackup, validateRestoreZip } from "@/lib/backup";
import { db } from "@/lib/db";

const DATA_DIR = () => process.env.DAFATIR_DATA_DIR ?? process.cwd();
const MAX_RESTORE_MB = 512;

/** تنزيل نسخة احتياطية كاملة (قاعدة + وثائق) — admin */
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return fail("صلاحية المدير مطلوبة", 403);

  try {
    const { tmpPath, size } = await createBackup();
    const buf = fs.readFileSync(tmpPath);
    fs.rmSync(path.dirname(tmpPath), { recursive: true, force: true });

    await db.setting.upsert({
      where: { key: "backup.lastAt" },
      update: { value: new Date().toISOString() },
      create: { key: "backup.lastAt", value: new Date().toISOString(), label: "آخر نسخة احتياطية" },
    });
    await auditLog("BACKUP", "Setting", "backup", `نسخة احتياطية (${Math.round(size / 1024 / 1024)} م.ب)`, getSessionUser(req)?.username ?? "system");

    const date = new Date().toISOString().slice(0, 10);
    const name = `dafatir-backup-${date}.zip`;
    return new Response(buf, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(size),
      },
    });
  } catch (e) {
    return handleDbError(e);
  }
}

/**
 * استلام ملف استعادة — admin
 * يُحفظ كـ pending-restore.zip وتُطبَّق عند الإقلاع التالي (لا نستبدل
 * قاعدة يعمل عليها النظام الآن).
 */
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return fail("صلاحية المدير مطلوبة", 403);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("التشكيلة غير صالحة — أرسل ملف ZIP", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("الملف مفقود", 400);
  if (!/\.zip$/i.test(file.name)) return fail("الملف يجب أن يكون ZIP", 400);
  if (file.size > MAX_RESTORE_MB * 1024 * 1024) return fail(`حجم الملف أكبر من ${MAX_RESTORE_MB} م.ب`, 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const check = validateRestoreZip(buf);
  if (!check.ok) return fail(check.error ?? "ملف غير صالح", 400);

  try {
    const dir = path.join(DATA_DIR(), "db");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "pending-restore.zip"), buf);

    const username = getSessionUser(req)?.username ?? "system";
    await auditLog("RESTORE_RECEIVED", "Setting", "backup", `استلام نسخة احتياطية (${file.name}) — تُطبَّق عند الإقلاع القادم`, username);
    return ok({
      applied: false,
      message: "تم استلام النسخة احتياطيًا. أُغلق البرنامج ثم أعد تشغيله لتُطبَّق الاستعادة.",
    });
  } catch (e) {
    return handleDbError(e);
  }
}
