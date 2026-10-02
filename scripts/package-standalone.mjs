#!/usr/bin/env node
/**
 * تجهيز حزمة التطبيق المستقلة للتغليف في .exe
 * ------------------------------------------------------------------
 * يُنتج release/app جاهزًا لـ electron-builder:
 *   release/app/server.js      — خادم Next.js standalone
 *   release/app/node_modules   — تبعاته
 *   release/app/.next/static   — الملفات الثابتة
 *   release/app/public         — إن وُجد
 *   release/app/db/app.db      — قاعدة بيانات مهيأة جديدة (admin/admin123)
 *   release/app/node.exe       — نسخة من Node على جهاز البناء (ويندوز)
 *
 * التشغيل:  npm run dist:web   (ثم npm run dist للتغليف الكامل)
 */
import { execSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = path.join(ROOT, "release", "app");
const IS_WIN = process.platform === "win32";

const log = (m) => console.log(`  ${m}`);

function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  const r = spawnSync(cmd, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    console.error(`فشل الأمر: ${cmd}`);
    process.exit(1);
  }
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true });
}

// 1) بناء الإنتاج إن لم يكن موجودًا
if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  log("لا يوجد بناء إنتاج — جارٍ البناء (next build)...");
  run("npm run build");
}

// 2) تفريغ منصة التجهيز
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

// 3) خادم standalone + الملفات الثابتة
copyDir(path.join(ROOT, ".next", "standalone"), STAGE);
fs.mkdirSync(path.join(STAGE, ".next"), { recursive: true });
copyDir(path.join(ROOT, ".next", "static"), path.join(STAGE, ".next", "static"));
if (fs.existsSync(path.join(ROOT, "public"))) copyDir(path.join(ROOT, "public"), path.join(STAGE, "public"));

// 4) قاعدة بيانات مهيأة جديدة (نسخة نظيفة يبدأ بها كل مستخدم)
fs.mkdirSync(path.join(STAGE, "db"), { recursive: true });
const freshDb = "file:../release/app/db/app.db"; // نسبي من prisma/
run("npx prisma db push --schema prisma/schema.prisma --skip-generate", { env: { DATABASE_URL: freshDb } });
run("npm run db:init", { env: { DATABASE_URL: freshDb, ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "admin123" } });
log("قاعدة البيانات المهيأة: release/app/db/app.db");

// 5) مخطط Prisma داخل الحزمة (لأدوات الصيانة المستقبلية)
fs.mkdirSync(path.join(STAGE, "prisma"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "prisma", "schema.prisma"), path.join(STAGE, "prisma", "schema.prisma"));
fs.copyFileSync(path.join(ROOT, "src", "lib", "accounting", "seed-data.json"), path.join(STAGE, "seed-data.json"));

// 6) نسخة من Node — الحزمة تحتاج وقت التشغيل Node حقيقيًا
const nodeExe = path.join(STAGE, "node.exe");
if (IS_WIN) {
  const which = spawnSync("where", ["node"], { cwd: ROOT, shell: true }).stdout.toString().trim().split(/\r?\n/)[0];
  if (!which) throw new Error("لم يُعثر على node.exe — ثبّت Node.js أولًا");
  fs.copyFileSync(which, nodeExe);
  log(`نسخ Node من: ${which}`);
} else {
  // البناء خارج ويندوز: نجهز الباقي، ونسخة الـ .exe تُبنى على جهاز ويندوز
  log("تحذير: أنت تبني على نظام غير ويندوز — تُبنى حزمة الـ .exe على جهاز ويندوز (node.exe لا يُنسَّخ).");
}

console.log("\n✓ منصة التجهيز جاهزة: release/app");
console.log("  للتغليف الكامل في .exe:  npm run dist");
