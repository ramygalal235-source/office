// ===== النسخ الاحتياطي والاستعادة (local-first) =====
// النسخ الاحتياطي: لقطة صالحة من SQLite عبر VACUUM INTO (آمنة أثناء التشغيل)
// + ملفات الوثائق + ملف وصف. الاستعادة: تُستلم من شاشة الإعدادات وتُطبَّق
// عند إقلاع الخادم التالي — لا نستبدل قاعدة بيانات يعمل عليها النظام.
import { db } from "@/lib/db";
import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = () => process.env.DAFATIR_DATA_DIR ?? process.cwd();
const UPLOADS_DIR = () => path.join(DATA_DIR(), "db", "uploads");
const PENDING_RESTORE = () => path.join(DATA_DIR(), "db", "pending-restore.zip");

/** مسار ملف قاعدة البيانات المطلق من DATABASE_URL (نسبي عن prisma/ عند الحاجة) */
export function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? "file:../db/app.db";
  let p = url.startsWith("file:") ? url.slice("file:".length) : url;
  p = p.split("?")[0];
  if (!path.isAbsolute(p)) p = path.join(process.cwd(), "prisma", p);
  return p;
}

function walk(dir: string, base: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else out.push(path.relative(base, abs));
  }
}

/** يصنع ملف النسخ الاحتياطي ويعيد مساره المؤقت */
export async function createBackup(): Promise<{ tmpPath: string; size: number }> {
  const dbPath = resolveDbPath();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dafatir-backup-"));
  const snapshot = path.join(tmpDir, "app.db");

  // VACUUM INTO: لقطة كاملة متسقة من قاعدة تعمل — بلا قفل ولا توقف
  await db.$queryRaw`VACUUM INTO ${snapshot}`;

  const zip = new AdmZip();
  const manifest = {
    app: "dafatir-almuhasib",
    version: 1,
    createdAt: new Date().toISOString(),
    schema: "prisma",
    dbFile: "app.db",
    uploadsPrefix: "uploads",
    random: crypto.randomBytes(8).toString("hex"),
  };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));
  zip.addLocalFile(snapshot, "", "app.db");

  const uploadsBase = UPLOADS_DIR();
  const uploadFiles: string[] = [];
  walk(uploadsBase, uploadsBase, uploadFiles);
  for (const rel of uploadFiles) {
    zip.addLocalFile(path.join(uploadsBase, rel), "", path.join("uploads", rel));
  }

  const tmpPath = path.join(tmpDir, "backup.zip");
  zip.writeZip(tmpPath);
  return { tmpPath, size: fs.statSync(tmpPath).size };
}

/** يتحقق من بنية ملف استعادة مقترح */
export function validateRestoreZip(buf: Buffer): { ok: boolean; error?: string; createdAt?: string } {
  try {
    const zip = new AdmZip(buf);
    const entries = zip.getEntries().map((e) => e.entryName);
    if (!entries.includes("app.db")) return { ok: false, error: "الملف لا يحتوي على app.db — ليس نسخة احتياطية صالحة" };
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry) return { ok: false, error: "الملف بلا ملف وصف (manifest.json)" };
    const manifest = JSON.parse(manifestEntry.getData().toString("utf8")) as { app?: string; createdAt?: string };
    if (manifest.app !== "dafatir-almuhasib") return { ok: false, error: "ملف نسخة احتياطية لنظام آخر" };
    return { ok: true, createdAt: manifest.createdAt };
  } catch {
    return { ok: false, error: "تعذّر قراءة الملف — تأكد أنه ملف ZIP صالح" };
  }
}

/**
 * يُستدعى عند إقلاع الخادم: إن وُجدت استعادة معلقة، تُطبَّق ثم تُحذف.
 *
 * حماية الإنتاج:
 *  - نعيد التحقق من بنية الملف لحظة التطبيق (ليس عند الاستلام فقط).
 *  - نحفظ آخر قاعدة سليمة (rotating ×2) قبل أي استبدال.
 *  - نظّف ملفات WAL/SHM القديمة — وجودها مع ملف قاعدة جديد يفسد الاسترداد.
 *  - فحص سلامة (integrity_check) بعد الاستبدال: عند الفشل نرجع لآخر سليم
 *    ونعزل الملف المريب بدل إبقاء النظام على قاعدة فاسدة.
 * أخطاء التطبيق تُبقي الملف معلقًا ليظهر في شاشة الحالة (محاولة أخرى لاحقًا)
 * ما لم يثبت فساده — عندها يُعزل ويُسجَّل الفشل.
 */
export async function applyPendingRestore(): Promise<{ applied: boolean; reason?: string }> {
  const pending = PENDING_RESTORE();
  if (!fs.existsSync(pending)) return { applied: false };

  const dbPath = resolveDbPath();
  const lastGood = `${dbPath}.last-good`;
  const lastGoodPrev = `${dbPath}.last-good.1`;

  const quarantine = (suffix: string) => {
    const q = `${pending}.${suffix}-${Date.now()}`;
    try {
      fs.renameSync(pending, q);
      return q;
    } catch {
      return pending;
    }
  };

  try {
    // 1) التحقق من البنية لحظة التطبيق
    const validation = validateRestoreZip(fs.readFileSync(pending));
    if (!validation.ok) {
      const q = quarantine("invalid");
      return { applied: false, reason: `ملف الاستعادة المعلقة تالف (${validation.error}) — عول في: ${q}` };
    }

    const zip = new AdmZip(fs.readFileSync(pending));
    const dbEntry = zip.getEntry("app.db");
    if (!dbEntry) throw new Error("pending-restore بلا app.db");

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    // 2) آخر نسخة سليمة (تدوير ×2)
    if (fs.existsSync(dbPath)) {
      if (fs.existsSync(lastGood)) fs.renameSync(lastGood, lastGoodPrev);
      fs.copyFileSync(dbPath, lastGood);
    } else {
      for (const f of [lastGood, lastGoodPrev]) if (fs.existsSync(f)) fs.rmSync(f, { force: true });
    }

    // 3) ملفات WAL/SHM قديمة — تُحذف قبل الاستبدال (الخادم لم يفتح القاعدة بعد)
    for (const suffix of ["-wal", "-shm"]) {
      try { fs.rmSync(dbPath + suffix, { force: true }); } catch {}
    }

    // 4) الاستبدال
    const dbTmp = `${dbPath}.restore-tmp`;
    fs.writeFileSync(dbTmp, dbEntry.getData());
    fs.renameSync(dbTmp, dbPath);

    // استبدال ملفات الوثائق (استبدال كامل: ما في النسخة هو الحقيقة)
    const uploadsBase = UPLOADS_DIR();
    fs.rmSync(uploadsBase, { recursive: true, force: true });
    for (const entry of zip.getEntries()) {
      if (!entry.entryName.startsWith("uploads/")) continue;
      const target = path.join(uploadsBase, entry.entryName.slice("uploads/".length));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, entry.getData());
    }

    // 5) فحص سلامة القاعدة الجديدة — أول اتصال بعد الاستبدال يكون عليها
    let integrity: string[];
    try {
      integrity = (await db.$queryRaw<{ integrity_check: string }[]>`PRAGMA integrity_check`).map(
        (r) => r.integrity_check
      );
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      throw new Error(`تعذّر فتح القاعدة المستعادة: ${reason}`);
    }

    if (!integrity.length || integrity[0] !== "ok") {
      const detail = integrity.slice(0, 3).join("؛ ");
      // نرجع لآخر سليم إن وُجد، ونعزل الملف المريب
      if (fs.existsSync(lastGood)) {
        // نقفل الاتصال أولًا — على ويندوز لا يُعاد تسمية ملف مقفول
        await db.$disconnect().catch(() => {});
        for (const suffix of ["-wal", "-shm"]) {
          try { fs.rmSync(dbPath + suffix, { force: true }); } catch {}
        }
        fs.renameSync(dbPath, `${dbPath}.bad-${Date.now()}`);
        fs.renameSync(lastGood, dbPath);
      }
      const q = quarantine("corrupt");
      return {
        applied: false,
        reason: `القاعدة المستعادة فاشلة فحص السلامة (${detail}) — عول الملف المريب في: ${q}`,
      };
    }

    fs.rmSync(pending, { force: true });

    // حدث في سلسلة السجل: الاستعادة نفسها تتبَّع (الحساب الصحيح للتجزئة داخل appendEvent)
    try {
      const { appendEvent } = await import("./automation/event-log");
      await appendEvent({
        action: "RESTORE",
        entity: "Setting",
        entityId: "backup",
        summary: "تمت استعادة نسخة احتياطية",
        actorType: "system",
        payload: { at: new Date().toISOString() },
      });
    } catch {
      // السجل قد يكون من إصدار مختلف — لا نُسقط الإقلاع
    }

    return { applied: true };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.error("[backup] فشل تطبيق الاستعادة المعلقة:", reason);
    return { applied: false, reason };
  }
}