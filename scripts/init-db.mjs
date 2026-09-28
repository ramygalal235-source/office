#!/usr/bin/env node
/**
 * تهيئة قاعدة بيانات دفاتر المحاسب
 * ------------------------------------------------------------------
 * ينشئ: مدير النظام، شجرة الحسابات القياسية، تسلسلات ترقيم المستندات،
 *        الخزينة الافتراضية، وإعدادات النظام الأساسية.
 *
 * آمن للتشغيل المتكرر: كل شيء يتم بـ upsert ولا يُكرّر البيانات.
 *
 *   node scripts/init-db.mjs
 *
 * متغيّرات البيئة: DATABASE_URL، ADMIN_USERNAME، ADMIN_PASSWORD
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scrypt } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const db = new PrismaClient();

const seedData = JSON.parse(
  readFileSync(join(ROOT, "src/lib/accounting/seed-data.json"), "utf8")
);

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(password.normalize("NFKC"), salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$${salt.toString("base64")}$${derived.toString("base64")}`);
    });
  });
}

async function seedUsers() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const existing = await db.user.findUnique({ where: { username } });

  if (existing) {
    console.log(`  • المستخدم «${username}» موجود مسبقًا — لم يتم تغيير كلمة المرور`);
    return { created: false, username };
  }

  await db.user.create({
    data: {
      username,
      passwordHash: await hashPassword(password),
      name: "مدير النظام",
      role: "admin",
      isActive: true,
      accessAllCompanies: true,
    },
  });
  console.log(`  • تم إنشاء مدير النظام: ${username} / ${password}`);
  if (password === "admin123") {
    console.log("    ⚠  غيّر كلمة المرور من داخل التطبيق بعد أول تسجيل دخول");
  }
  return { created: true, username };
}

async function seedAccounts() {
  const existing = await db.account.count();
  if (existing > 0) {
    console.log(`  • دليل الحسابات مهيّأ بالفعل (${existing} حساب)`);
    return;
  }

  // نمرّ على الشجرة بالترتيب: الأبون معرّفون قبل الأبناء
  const byCode = new Map();
  const sorted = [...seedData.chartOfAccounts].sort((a, b) => a.code.length - b.code.length);
  const levelOf = (acc) => {
    let level = 1;
    let parentCode = acc.parentCode;
    while (parentCode) {
      level += 1;
      parentCode = byCode.get(parentCode)?.parentCode;
    }
    return level;
  };

  for (const acc of sorted) {
    const parent = acc.parentCode ? byCode.get(acc.parentCode) : undefined;
    const created = await db.account.create({
      data: {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        parentId: parent?.id ?? null,
        isGroup: Boolean(acc.isGroup),
        level: levelOf(acc),
        isSystem: true,
        isActive: true,
      },
    });
    byCode.set(acc.code, created);
  }
  console.log(`  • تم إنشاء ${sorted.length} حساب في دليل الحسابات`);
}

async function seedSequences() {
  for (const seq of seedData.sequences) {
    await db.documentSequence.upsert({
      where: { type: seq.type },
      update: {},
      create: {
        type: seq.type,
        prefix: seq.prefix,
        nextNumber: seq.nextNumber,
        padding: seq.padding,
      },
    });
  }
  console.log(`  • تم تهيئة ${seedData.sequences.length} تسلسل ترقيم للمستندات`);
}

async function seedSafes() {
  const cashbox = await db.safe.findUnique({ where: { code: "SAF-00001" } });
  if (!cashbox) {
    const cashAccount = await db.account.findUnique({ where: { code: "1101" } });
    await db.safe.create({
      data: {
        code: "SAF-00001",
        name: "الخزينة الرئيسية",
        type: "CASH",
        accountId: cashAccount?.id ?? null,
        openingBalance: 0,
        isActive: true,
      },
    });
    console.log("  • تم إنشاء الخزينة الرئيسية (مرتبطة بحساب 1101 النقدية بالصندوق)");
  }
}

async function seedSettings() {
  const defaults = [
    { key: "company.name", value: "شركة دفاتر المحاسب", group: "company", label: "اسم الشركة" },
    { key: "tax.vatRate", value: "14", group: "tax", label: "نسبة ضريبة القيمة المضافة %" },
    { key: "tax.whtRate", value: "1", group: "tax", label: "نسبة ضريبة الخصم والتحصيل %" },
    { key: "tax.invoicePrefix", value: "INV-", group: "tax", label: "بادئة فواتير البيع" },
    { key: "fiscal.yearStartMonth", value: "1", group: "fiscal", label: "شهر بداية السنة المالية" },
    { key: "backup.autoOnExit", value: "false", group: "backup", label: "نسخة احتياطية عند الإغلاق" },
  ];
  for (const s of defaults) {
    await db.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`  • تم تهيئة ${defaults.length} إعداد للنظام`);
}

async function main() {
  console.log("\nتهيئة قاعدة بيانات دفاتر المحاسب\n" + "─".repeat(38));
  await seedUsers();
  await seedAccounts();
  await seedSequences();
  await seedSafes();
  await seedSettings();
  console.log("─".repeat(38));
  console.log("تمت التهيئة بنجاح. شغّل الآن:  npm run dev\n");
}

main()
  .catch((err) => {
    console.error("\nفشلت التهيئة:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
