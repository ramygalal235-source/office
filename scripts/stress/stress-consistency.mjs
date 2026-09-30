// ===== اختبار ضغط 3: تساقب الملفات (static consistency) =====
// يفحص أن كل ما يُشار إليه في كود مكان موجود في مكان آخر:
// قواعد → معالجات، تنقّل → صفحات وأيقونات، استدعاءات API → ملفات routes،
// كيانات الأحداث → نماذج Prisma، ومخطّطان مطابقان، ومفاتيح فريدة.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) passed++;
  else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ------------------------------------------------------------------ المخطّطان
{
  const a = read("schema.prisma");
  const b = read("prisma/schema.prisma");
  check("schema/مطابقان نصيًا", a === b);
  const models = [...a.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
  check("schema/43 نموذجًا", models.length === 43, `حصلنا على ${models.length}`);
  globalThis.__models = new Set(models);
}

// ------------------------------------------------------------------ القواعد → المعالجات
{
  const seed = JSON.parse(read("src/lib/accounting/seed-data.json"));
  const rules = seed.automationRules;
  const codes = rules.map((r) => r.code);
  check("rules/أكواد فريدة", new Set(codes).size === codes.length);

  const cronField = /^(\*|\d{1,2}(-\d{1,2})?(\/\d{1,2})?(,\d{1,2}(-\d{1,2})?(\/\d{1,2})?)*$)/;
  const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const validCron = (expr) => {
    if (!expr) return false;
    const f = expr.trim().split(/\s+/);
    if (f.length !== 5) return false;
    return f.every((spec, i) => {
      if (!cronField.test(spec)) return false;
      const nums = spec.match(/\d+/g) ?? [];
      return nums.every((n) => Number(n) >= ranges[i][0] && Number(n) <= ranges[i][1]);
    });
  };

  const handlersSrc = read("src/lib/automation/handlers.ts");
  const handlerKeys = [...handlersSrc.matchAll(/handlers\["([^"]+)"\]\s*=/g)].map((m) => m[1]);
  check("handlers/9 معالجات", handlerKeys.length === 9, `حصلنا على ${handlerKeys.length}: ${handlerKeys.join(",")}`);
  check("handlers/مفاتيح فريدة", new Set(handlerKeys).size === handlerKeys.length);

  for (const r of rules) {
    check(`rule/${r.code}/نوع شرعي`, ["EVENT", "SCHEDULE"].includes(r.trigger), r.trigger);
    if (r.trigger === "EVENT") check(`rule/${r.code}/eventType موجود`, !!r.eventType);
    if (r.trigger === "SCHEDULE") check(`rule/${r.code}/جدول صالح`, validCron(r.cron), r.cron);
    check(`rule/${r.code}/معالج موجود`, handlerKeys.includes(r.enqueueJob), r.enqueueJob);
  }

  // القواعد تُحقن في البيانات: نفس المصدر الذي يقرأه seed
  const rulesTs = read("src/lib/automation/rules.ts");
  check("rules/مصدر واحد", rulesTs.includes("seedData.automationRules"));
}

// ------------------------------------------------------------------ دليل الحسابات والتسلسلات
{
  const seed = JSON.parse(read("src/lib/accounting/seed-data.json"));
  const acctCodes = (seed.accounts ?? []).map((a) => a.code);
  check("seed/أكواد حسابات فريدة", new Set(acctCodes).size === acctCodes.length, `من ${acctCodes.length}`);
  const seqCodes = (seed.sequences ?? []).map((s) => s.type);
  check("seed/تسلسلات فريدة", new Set(seqCodes).size === seqCodes.length);
  for (const needed of ["INVOICE", "PURCHASE", "JOURNAL", "ENGAGEMENT", "PRODUCT", "PARTY"]) {
    check(`seed/تسلسل ${needed}`, seqCodes.includes(needed));
  }
}

// ------------------------------------------------------------------ كيانات الأحداث ∈ النماذج
{
  const models = globalThis.__models;
  const eventLog = read("src/lib/automation/event-log.ts");
  const slugBlock = eventLog.match(/const ENTITY_SLUG[\s\S]*?\n\};/)?.[0] ?? "";
  const slugEntries = [...slugBlock.matchAll(/^\s{2}(\w+):\s*"(\w+)"/gm)];
  const slugs = new Set(slugEntries.map((m) => m[1]));
  const slugValues = slugEntries.map((m) => m[2]);
  check("events/ENTITY_SLUG مسارات فريدة", new Set(slugValues).size === slugValues.length, slugValues.join(","));
  check("events/ENTITY_SLUG يُقرأ", slugs.size >= 14, `حصلنا على ${slugs.size}`);

  // كل entity: "X" في استدعاءات record/appendEvent عبر المشروع ∈ النماذج
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  })("src");
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bentity:\s*"(\w+)"/g)) used.add(m[1]);
  }
  const allowedEntities = new Set([...models, ...slugs]);
  check("events/كل الكيانات المستخدمة ∈ (نماذج ∪ ENTITY_SLUG)", [...used].every((u) => allowedEntities.has(u)), `غريبة: ${[...used].filter((u) => !allowedEntities.has(u)).join(",")}`);

  // كل delegate يُستدعى db.X موجود كنموذج
  const delegates = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bdb\.(\w+)\./g)) delegates.add(m[1]);
    for (const m of src.matchAll(/\btx\.(\w+)\./g)) delegates.add(m[1]);
  }
  const toModel = (d) => d[0].toUpperCase() + d.slice(1);
  const badDelegates = [...delegates].filter((d) => !models.has(toModel(d)) && d !== "$transaction" && d !== "$queryRaw" && d !== "$disconnect");
  check("db/كل المندوبين ∈ النماذج", badDelegates.length === 0, badDelegates.join(","));
}

// ------------------------------------------------------------------ التنقّل ↔ الصفحات والأيقونات
{
  const navSrc = read("src/lib/nav.ts");
  const shell = read("src/components/app-shell.tsx");
  const iconsBlock = shell.match(/const ICONS: Record<string, LucideIcon> = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  const iconKeys = new Set([...iconsBlock.matchAll(/^\s{2}(\w+),?\s*$/gm)].map((m) => m[1]));

  const navItems = navSrc.match(/\{ href: "[^"]+"[^}]*\}/g) ?? [];
  check("nav/20 عنصرًا", navItems.length === 20, `حصلنا على ${navItems.length}`);
  for (const block of navItems) {
    const href = block.match(/href:\s*"([^"]+)"/)[1];
    const icon = block.match(/icon:\s*"([^"]+)"/)?.[1];
    const disabled = /disabled:\s*true/.test(block);
    const pagePath = href === "/" ? "src/app/(app)/page.tsx" : `src/app/(app)/${href.slice(1)}/page.tsx`;
    if (!disabled) check(`nav/${href}/صفحة موجودة`, fs.existsSync(path.join(root, pagePath)), pagePath);
    if (icon) check(`nav/${href}/أيقونة مسجلة`, iconKeys.has(icon), icon);
  }

  // العكس: كل صفحة في (app) لها عنصر تنقّل (لا شاشات معزولة)
  const appDir = path.join(root, "src/app/(app)");
  const pages = fs
    .readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(appDir, e.name, "page.tsx")))
    .map((e) => `/${e.name}`);
  pages.push("/");
  const hrefs = new Set([...navSrc.matchAll(/href:\s*"([^"]+)"/g)].map((m) => m[1]));
  check("nav/كل الصفحات مرتبطة", pages.every((p) => hrefs.has(p)), `معزولة: ${pages.filter((p) => !hrefs.has(p)).join(",")}`);
}

// ------------------------------------------------------------------ استدعاءات API ↔ ملفات routes
{
  const apiDir = path.join(root, "src/app/api");
  const routeFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") routeFiles.push(p);
    }
  })(apiDir);

  // كل route.ts يصدّر معالجًا واحدًا على الأقل
  for (const rf of routeFiles) {
    const src = fs.readFileSync(rf, "utf8");
    const hasHandler = /export\s+async\s+function\s+(GET|POST|PUT|DELETE|PATCH)/.test(src);
    check(`api/${rf.replace(root, "")}/معالج`, hasHandler);
  }

  // كل مسار يُستدعى من الواجهة له route
  const files = [];
  (function walk2(dir) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk2(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  })("src");

  const apiDirRel = "src/app/api";
  const missing = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:apiFetch|fetch)\(\s*["'`]\/api\/([^"'`?#]+)/g)) {
      // نجرّب المسار كما هو، وإن فشل نجرب آخر قسم كـ [id] (مسارات ديناميكية)
      const parts = m[1].split("/").filter(Boolean);
      const dynamic = parts.map((p) => (/^\$\{/.test(p) ? "[id]" : p));
      const candidates = new Set();
      candidates.add("src/app/api/" + parts.join("/"));
      candidates.add("src/app/api/" + dynamic.join("/"));
      // مسار منتهٍ بمعامل (مثل /api/tasks/${id}) — قد تكون المجلد [id] أو route بباراميتر
      const ok = [...candidates].some((c) => fs.existsSync(path.join(root, c, "route.ts")));
      if (!ok) missing.add(`${m[1]} (من ${f.replace(root + "/", "")})`);
    }
  }
  check("api/كل الاستدعاءات لها route", missing.size === 0, [...missing].slice(0, 6).join(" | "));
}

// ------------------------------------------------------------------ البوابة الأمنية سليمة
{
  const mw = read("src/middleware.ts");
  check("auth/المiddleware يحرس /api", mw.includes("/api") && mw.includes("dafater_session"));
  const auth = read("src/lib/auth.ts");
  check("auth/دور المشاهدة للقراءة", auth.includes("viewer") && auth.includes("accountant") && auth.includes("admin"));
}

console.log(`[consistency] نجح ${passed} — فشل ${failed}`);
if (failures.length) {
  console.log("الفشل:");
  for (const f of failures.slice(0, 30)) console.log("  ✗", f);
  process.exitCode = 1;
}
export default { passed, failed };
