#!/usr/bin/env node
/**
 * فاحص ثابت خفيف — يلتقط أكثر الأخطاء شيوعًا بدون تشغيل TypeScript:
 *   1) استيرارات @/ تشير إلى ملفات غير موجودة أو رموز غير مُصدَّرة
 *   2) حقول Prisma غير الموجودة في prisma/schema.prisma (مثل db.invoice.foo)
 *   3) أسماء النماذج في db.<model> غير موجودة
 *
 *   node scripts/check-imports.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

// ===== قراءة المخطط =====
const schemaSrc = readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8");
const models = new Map();
for (const m of schemaSrc.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const fields = new Set();
  const relations = new Set();
  const whereExtras = new Set(); // مفاتيح مركّبة من @@unique/@@id
  for (const line of m[2].split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("//")) continue;
    const cu = t.match(/@@(?:unique|id)\(\[(.*?)\]\)/);
    if (cu) {
      whereExtras.add(cu[1].split(",").map((s) => s.trim()).filter(Boolean).join("_"));
      continue;
    }
    if (t.startsWith("@@")) continue;
    const parts = t.split(/\s+/);
    const name = parts[0];
    if (!name) continue;
    fields.add(name);
    const type = (parts[1] || "").replace(/\[\]$/, "").replace(/\?$/, "");
    if (t.includes("@relation") || (type && models.has(type))) relations.add(name);
  }
  models.set(m[1], { fields, relations, whereExtras, body: m[2] });
}
// المرور الثاني: العلاقات غير المسماة (قائمة بلا @relation) — النوع اسم نموذج آخر
for (const [, m] of models) {
  for (const line of m.body.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("@@") || t.startsWith("//")) continue;
    const parts = t.split(/\s+/);
    const type = (parts[1] || "").replace(/\[\]$/, "").replace(/\?$/, "");
    if (type && models.has(type) && !t.includes("@relation")) m.relations.add(parts[0]);
  }
}

// Prisma يعرض النماذج بأسماء camelCase: db.clientCompany => model ClientCompany
function pascal(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
function findModel(clientName) {
  return models.get(clientName) ?? models.get(pascal(clientName));
}

// ===== جمع الملفات =====
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".ts", ".tsx"].includes(extname(full))) out.push(full);
  }
  return out;
}
const files = walk(SRC);

// ===== جمع التصديرات لكل ملف =====
const exportsOf = new Map();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g))
    names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    m[1].split(",").forEach((p) => {
      const bits = p.trim().split(/\s+as\s+/);
      const n = (bits[1] ?? bits[0] ?? "").trim();
      if (n) names.add(n);
    });
  if (/export\s+default/.test(src)) names.add("default");
  if (/export\s+\*/.test(src)) names.add("*");
  exportsOf.set(file, names);
}

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // حزمة خارجية
  const tries = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")];
  return tries.find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
}

const problems = [];

// ===== 1) الاستيرادات =====
const importRe = /import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(importRe)) {
    const clause = m[2].trim();
    const spec = m[3];
    const target = resolveImport(file, spec);
    if (!target) {
      if (!spec.startsWith("@/") && !spec.startsWith(".")) continue;
      problems.push(`${rel(file)} → لا يوجد ملف لـ «${spec}»`);
      continue;
    }
    const exported = exportsOf.get(target);
    if (!exported || exported.has("*")) continue;
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (!braces) continue;
    for (const raw of braces[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim().replace(/^type\s+/, "");
      if (!name) continue;
      if (!exported.has(name))
        problems.push(`${rel(file)} → «${name}» غير مُصدَّر من ${rel(target)}`);
    }
  }
}

// ===== 2,3) حقول Prisma =====
const RELATION_MODEL = { // db.journalLine.findMany({ include: { journalEntry: ... } })
  clientCompany: "ClientCompany",
  company: "Company",
  user: "User",
  party: "Party",
  safe: "Safe",
  account: "Account",
  product: "Product",
  invoice: "Invoice",
  purchase: "Purchase",
  journalEntry: "JournalEntry",
  budget: "Budget",
  employee: "Employee",
  payrollRun: "PayrollRun",
  fixedAsset: "FixedAsset",
};

for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!/\bdb\./.test(src)) continue;

  // db.<model>.<op>
  for (const m of src.matchAll(/\bdb\.(\w+)\.(\w+)\s*\(/g)) {
    const [, clientName, op] = m;
    const model = findModel(clientName);
    if (!model) {
      problems.push(`${rel(file)} → النموذج db.${clientName} غير موجود في المخطط`);
      continue;
    }
    const known = [
      "findMany", "findUnique", "findFirst", "create", "createMany", "update", "updateMany",
      "upsert", "delete", "deleteMany", "count", "aggregate", "groupBy", "$transaction",
      "$queryRaw", "$executeRaw", "$connect", "$disconnect",
    ];
    if (!known.includes(op))
      problems.push(`${rel(file)} → عملية Prisma غير معروفة db.${clientName}.${op}`);
  }

  // db.<model>.{ create|update|upsert }({ data: { field: ... } })
  // مسح متوازن للأقواس حول data: بدل التعبير النمطي
  for (const m of src.matchAll(/\bdb\.(\w+)\.(?:create|update|upsert)\s*\(/g)) {
    const model = findModel(m[1]);
    if (!model) continue;
    // نبحث عن data: داخل الاستدعاء نفسه فقط (توازن الأقواس) —
    // البحث في بقية الملف كان يلتقط data: من استدعاء لاحق وينسبه خطأً
    const callOpen = m.index + m[0].length - 1;
    let cd = 0, callEnd = -1;
    for (let i = callOpen; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(" || ch === "{") cd++;
      else if (ch === ")" || ch === "}") { cd--; if (cd === 0) { callEnd = i; break; } }
    }
    if (callEnd === -1 || callEnd - m.index > 8000) continue;
    const range = src.slice(callOpen, callEnd + 1);
    const dataIdx = range.indexOf("data:");
    if (dataIdx === -1) continue;
    const open = range.indexOf("{", dataIdx);
    if (open === -1) continue;
    // data: متغير (ليس كائنًا محددًا) — لا نستطيع فحصه ساكنًا فنتركه
    if (range.slice(dataIdx + 5, open).replace(/\/\/[^\n]*/g, "").trim() !== "") continue;
    let depth = 0, end = -1;
    for (let i = open; i < range.length; i++) {
      if (range[i] === "{") depth++;
      else if (range[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;
    const body = range.slice(open + 1, end);
    let d = 0;
    for (const line of body.split("\n")) {
      if (d === 0) {
        const k = line.trim().match(/^(\w+)\s*:/);
        if (k && !["select", "include", "where", "orderBy"].includes(k[1]) && !model.fields.has(k[1]))
          problems.push(`${rel(file)} → الحقل «${k[1]}» غير موجود في نموذج ${m[1]}`);
      }
      for (const ch of line) {
        if (ch === "{") d++;
        else if (ch === "}") d--;
      }
      if (d < 0) d = 0;
    }
  }
}

// ===== 5) مفاتيح include/select/where/orderBy أعلى مستوى =====
// مفاتيح include: يجب أن تكون علاقات، ومفاتيح select/where/orderBy حقول موجودة
const PRISMA_OPS = [
  "findMany", "findUnique", "findFirst", "count", "aggregate", "groupBy",
  "update", "updateMany", "delete", "deleteMany", "create", "upsert",
];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (!/\bdb\./.test(src)) continue;
  for (const m of src.matchAll(/\bdb\.(\w+)\.(\w+)\s*\(/g)) {
    const model = findModel(m[1]);
    if (!model || !PRISMA_OPS.includes(m[2])) continue;
    const callOpen = m.index + m[0].length - 1;
    let cd = 0, callEnd = -1;
    for (let i = callOpen; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(" || ch === "{") cd++;
      else if (ch === ")" || ch === "}") { cd--; if (cd === 0) { callEnd = i; break; } }
    }
    if (callEnd === -1 || callEnd - m.index > 12000) continue;
    let range = src.slice(callOpen + 1, callEnd);
    // نُبطل محتوى السلاسل (مع إبقاء أقواس ${ } داخل القوالب متوازنة)
    range = range
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, (tpl) => tpl.replace(/[^{}]/g, " "));
    if (range.indexOf("{") === -1) continue;

    const whereSet = new Set([...model.fields, ...model.whereExtras]);
    const rules = {
      include: { set: model.relations, label: "علاقة" },
      select: { set: model.fields, label: "حقل" },
      where: { set: whereSet, label: "حقل", extra: ["AND", "OR", "NOT"] },
      orderBy: { set: model.fields, label: "حقل" },
    };
    let d = 0;
    let currentKey = null;
    const keyRe = /(\w+)\s*:/g;
    let km;
    while ((km = keyRe.exec(range)) !== null) {
      const before = range.slice(0, km.index);
      const depth = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
      const key = km[1];
      if (key === "true" || key === "false" || key === "null") continue; // مُشغّل ثلاثي
      if (depth === 1) {
        currentKey = key;
        continue;
      }
      if (depth === 2 && currentKey && rules[currentKey] && !key.startsWith("_")) {
        const rule = rules[currentKey];
        if (!rule.set.has(key) && !(rule.extra || []).includes(key)) {
          problems.push(`${rel(file)} → ${currentKey}: «${key}» ليس ${rule.label} في نموذج ${m[1]}`);
        }
      }
    }
  }
}

// ===== 4) استخدام الـ hooks في ملف بلا "use client" =====
// خطأ شائع في Next.js App Router: الملف يصبح Server Component فيفشل البناء.
const HOOK_RE = /\b(useState|useEffect|useMemo|useCallback|useRef|useReducer|useContext|useRouter|usePathname|useSearchParams|useTheme)\s*\(/;
for (const file of files) {
  if (!file.endsWith(".tsx")) continue;
  const src = readFileSync(file, "utf8");
  if (!HOOK_RE.test(src)) continue;
  const hasDirective = /^\s*["']use client["']/m.test(src.slice(0, 400));
  if (!hasDirective)
    problems.push(`${rel(file)} → يستخدم hooks بدون توجيه «use client»`);
}

function rel(p) {
  return p.replace(ROOT + "/", "");
}

const unique = [...new Set(problems)].sort();
if (unique.length) {
  console.log(`\nمشاكل (${unique.length}):`);
  for (const p of unique) console.log("  ✗", p);
  process.exit(1);
}
console.log(`\n✓ فحص ${files.length} ملف: الاستيرادات وحقول Prisma سليمة`);
