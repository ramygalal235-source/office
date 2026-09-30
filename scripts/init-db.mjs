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
    await db.setting.upsert({
      where: { key: "security.defaultCreds" },
      update: { value: "true" },
      create: { key: "security.defaultCreds", value: "true", group: "security", label: "بيانات الدخول الافتراضية سارية" },
    });
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

// دفاتر المكتب: شركة خاصة (kind = OFFICE) تحمل الدفاتر الذاتية للمكتب
async function seedOfficeCompany() {
  const existing = await db.clientCompany.findUnique({ where: { code: "OFFICE" } });
  if (existing) return existing;
  const created = await db.clientCompany.create({
    data: {
      code: "OFFICE",
      nameAr: "دفاتر المكتب",
      entityType: "COMPANY",
      kind: "OFFICE",
      isActive: true,
    },
  });
  console.log("  • تم إنشاء دفاتر المكتب (الشركة الخاصة بالنطاق المحاسبي)");
  return created;
}

async function seedSafes() {
  const office = await seedOfficeCompany();
  const cashbox = await db.safe.findUnique({ where: { code: "SAF-00001" } });
  if (!cashbox) {
    const cashAccount = await db.account.findUnique({ where: { code: "1101" } });
    await db.safe.create({
      data: {
        code: "SAF-00001",
        companyId: office.id,
        name: "الخزينة الرئيسية",
        type: "CASH",
        accountId: cashAccount?.id ?? null,
        openingBalance: 0,
        isActive: true,
      },
    });
    console.log("  • تم إنشاء الخزينة الرئيسية (مرتبطة بحساب 1101 النقدية بالصندوق)");
  } else if (!cashbox.companyId) {
    await db.safe.update({ where: { id: cashbox.id }, data: { companyId: office.id } });
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
    { key: "ocr.provider", value: "ollama", group: "ocr", label: "مزود الاستخراج (ollama | zai | custom)" },
    { key: "ocr.model", value: "qwen2.5vl:7b", group: "ocr", label: "نموذج الاستخراج البصري" },
    { key: "ocr.baseUrl.ollama", value: "http://127.0.0.1:11434/v1", group: "ocr", label: "عنوان Ollama المحلي" },
    { key: "ocr.apiKey", value: "", group: "ocr", label: "مفتاح الاستخراج للمزود السحابي (إن لزم)" },
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

// ===== الأتمتة وإدارة المكتب =====

async function seedAutomation() {
  const services = [
    { code: "BOOK-KEEPING", name: "مسك دفاتر", category: "ACCOUNTING", defaultFee: 4000, slaDays: 7 },
    { code: "VAT-MONTHLY", name: "إقرار ضريبة القيمة المضافة الشهري", category: "TAX", defaultFee: 1500, slaDays: 5 },
    { code: "INCOME-TAX", name: "الإقرار الضريبي عن العام المالي", category: "TAX", defaultFee: 8000, slaDays: 30 },
    { code: "AUDIT-YEAR", name: "مراجعة القوائم المالية السنوية", category: "AUDIT", defaultFee: 25000, slaDays: 45 },
    { code: "PAYROLL", name: "رواتب وأشغال", category: "PAYROLL", defaultFee: 3000, slaDays: 5 },
    { code: "ADVISORY", name: "استشارات ضريبية", category: "ADVISORY", defaultFee: 0, slaDays: 10 },
  ];

  let servicesCreated = 0;
  for (const s of services) {
    const existing = await db.serviceType.findUnique({ where: { code: s.code } });
    if (existing) continue;
    await db.serviceType.create({ data: s });
    servicesCreated += 1;
  }
  if (servicesCreated) console.log(`  • تم إنشاء ${servicesCreated} خدمة من الكتالوج`);

  const templates = [
    { code: "BK-COLLECT", title: "تحصيل المديونيات المستحقة", category: "ACCOUNTING", priority: "HIGH", offsetDays: 0, serviceCode: "BOOK-KEEPING", estimatedMinutes: 120 },
    { code: "BK-BANKREC", title: "مطابقة كشوف البنك مع اليومية", category: "ACCOUNTING", priority: "HIGH", offsetDays: 3, serviceCode: "BOOK-KEEPING", estimatedMinutes: 180 },
    { code: "BK-EXPENSES", title: "مراجعة وتنظيم مصروفات الفترة", category: "ACCOUNTING", priority: "MEDIUM", offsetDays: 5, serviceCode: "BOOK-KEEPING", estimatedMinutes: 90 },
    { code: "VAT-PREP", title: "تجهيز إقرار القيمة المضافة", category: "VAT", priority: "URGENT", offsetDays: 1, serviceCode: "VAT-MONTHLY", estimatedMinutes: 150 },
    { code: "VAT-FILE", title: "رفع الإقرار على بوابة مصلحة الضرائب", category: "FILING", priority: "URGENT", offsetDays: 3, serviceCode: "VAT-MONTHLY", estimatedMinutes: 45 },
    { code: "IT-COMPUTE", title: "إقرار ضريبة الدخل السنوي", category: "TAX", priority: "HIGH", offsetDays: 7, serviceCode: "INCOME-TAX", estimatedMinutes: 300 },
    { code: "AUD-PREP", title: "تجهيز ملفات المراجعة السنوية", category: "AUDIT", priority: "HIGH", offsetDays: 10, serviceCode: "AUDIT-YEAR", estimatedMinutes: 600 },
    { code: "AUD-FIELDWORK", title: "أعمال المراجعة الميدانية", category: "AUDIT", priority: "HIGH", offsetDays: 25, serviceCode: "AUDIT-YEAR", estimatedMinutes: 900 },
    { code: "PAY-PREP", title: "اعتماد مسير الرواتب", category: "PAYROLL", priority: "HIGH", offsetDays: 0, serviceCode: "PAYROLL", estimatedMinutes: 90 },
    { code: "GEN-REVIEW", title: "مراجعة نهائية واعتماد", category: "GENERAL", priority: "MEDIUM", offsetDays: 14, serviceCode: null, estimatedMinutes: 60 },
  ];

  let templatesCreated = 0;
  for (const t of templates) {
    const existing = await db.taskTemplate.findUnique({ where: { code: t.code } });
    if (existing) continue;
    await db.taskTemplate.create({ data: { ...t, isActive: true } });
    templatesCreated += 1;
  }
  if (templatesCreated) console.log(`  • تم إنشاء ${templatesCreated} قالب مهمة`);

  let rulesCreated = 0;
  for (const r of seedData.automationRules ?? []) {
    const existing = await db.automationRule.findUnique({ where: { code: r.code } });
    if (existing) continue;
    await db.automationRule.create({
      data: {
        code: r.code,
        name: r.name,
        description: r.description ?? null,
        trigger: r.trigger,
        eventType: r.eventType ?? null,
        cron: r.cron ?? null,
        enqueueJob: r.enqueueJob,
        priority: r.priority ?? 100,
        enabled: true,
      },
    });
    rulesCreated += 1;
  }
  if (rulesCreated) console.log(`  • تم إنشاء ${rulesCreated} قاعدة أتمتة`);
}

async function main() {
  console.log("\nتهيئة قاعدة بيانات دفاتر المحاسب\n" + "─".repeat(38));
  await seedUsers();
  await seedAccounts();
  await seedSequences();
  await seedSafes();
  await seedSettings();
  await seedAutomation();
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
