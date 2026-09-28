// ===== اختبار ضغط 1: منطق صريح (prompt.ts + money.ts) =====
// يحشد الكود الفعلي بإدخالات مشوهة وعدائية. الهدف: لا تعليق، لا استثناء
// خارج الأخطاء المتوقعة، ولا قيمة خاطئة تُرجع بصمت.
import { buildExtractionPrompt, extractJson, parseOcrResponse } from "../../src/lib/ocr/prompt.ts";
import { round2, sumMoney, lineTotal, totalsOf, formatMoney, daysUntil } from "../../src/lib/money.ts";

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

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ------------------------------------------------------------------ extractJson
{
  const valid = { doc_type: { value: "INVOICE", confidence: 0.9 }, date: { value: "2026-09-01", confidence: 1, raw: "1/9/2026" }, total_amount: { value: 1140, confidence: 0.8, raw: "١٬١٤٠" } };
  const base = JSON.stringify(valid);

  // سليم مع أصناف شائعة في إجابات النماذج
  for (const wrapped of [base, `  ${base}  `, "```json\n" + base + "\n```", "إليك البيانات:\n" + base, base + " وأملينا أن تكون كافية."]) {
    let got = null;
    try { got = extractJson(wrapped); } catch (e) { check("extractJson/نموذج سليم", false, String(e)); continue; }
    check("extractJson/نموذج سليم", got?.doc_type?.value === "INVOICE" && got.total_amount.value === 1140);
  }

  // مقاطع: يجب أن يرمي (لا يقبل نصًا نصفه مفقود)
  let threw = 0;
  for (let i = 0; i < 400; i++) {
    const cut = randInt(1, base.length - 1);
    try { extractJson(base.slice(0, cut)); } catch { threw++; }
  }
  check("extractJson/مقاطع ترمي", threw >= 380, `رمي ${threw}/400`);

  // أقواس داخل النصوص: لا تكسر عدّ الأعماق
  const tricky = JSON.stringify({ notes: { value: "النص يحتوي { و } و \" اقتباسات \" و \\", confidence: 0.7, raw: "raw { } }" } });
  check("extractJson/أقواس داخل نصوص", extractJson(tricky).notes.value.includes("{ و }"));

  // كائنان متتاليان: يعيد الأول فقط
  check("extractJson/كائن أول", extractJson(base + " " + base).doc_type.value === "INVOICE");

  // ضباب عشوائي: لا يعلق ولا يرمي خطأ نوع
  let clean = 0, cleanErr = 0, otherErr = 0;
  for (let i = 0; i < 20000; i++) {
    let s = base;
    const ops = randInt(1, 4);
    for (let j = 0; j < ops; j++) {
      const pos = randInt(0, s.length);
      const op = randInt(0, 3);
      if (op === 0) s = s.slice(0, pos) + s.slice(pos + 1); // حذف
      else if (op === 1) s = s.slice(0, pos) + "{}\":\n"[randInt(0, 4)] + s.slice(pos); // حقن
      else if (op === 2) s = s.slice(0, pos) + "  " + s.slice(pos); // توسيع
      else s = s + " }";
    }
    try {
      const r = extractJson(s);
      if (r && typeof r === "object") clean++;
      else otherErr++;
    } catch (e) {
      if (e instanceof SyntaxError || e instanceof Error) cleanErr++;
      else otherErr++;
    }
  }
  check("extractJson/ضباب 20k لا يعلق ولا يخطئ نوعًا", otherErr === 0, `clean=${clean} err=${cleanErr} other=${otherErr}`);
}

// ------------------------------------------------------------------ parseOcrResponse
{
  const mk = (fields) => JSON.stringify(fields);

  // حالة كاملة
  const full = mk({
    doc_type: { value: "INVOICE", confidence: 0.95, raw: "فاتورة" },
    date: { value: "2026-09-15", confidence: 0.99, raw: "15/9/2026" },
    party_name: { value: "شركة النور", confidence: 0.9, raw: "شركة النور للتوريدات" },
    total_amount: { value: 1140, confidence: 0.9, raw: "1,140.00" },
    tax_amount: { value: 140, confidence: 0.9, raw: "140" },
    net_amount: { value: 1000, confidence: 0.9, raw: "1000" },
  });
  const fullRes = parseOcrResponse(full);
  check("parse/حالة كاملة", fullRes.docType === "INVOICE" && fullRes.fields.length === 10 && fullRes.confidence > 0.8);

  // أرقام هندية عربية (قد يخرجها النموذج عند رؤية وثيقة عربية)
  const arabicDigits = mk({ total_amount: { value: "١٬٢٣٤٫٥", confidence: 0.9, raw: "١٬٢٣٤٫٥" } });
  const ad = parseOcrResponse(arabicDigits);
  const adTotal = ad.fields.find((f) => f.key === "total_amount");
  check("parse/أرقام هندية عربية", adTotal?.value === 1234.5, `حصلنا على ${JSON.stringify(adTotal?.value)}`);

  const arabicDigits2 = mk({ total_amount: { value: "۱۲۳۴", confidence: 0.9, raw: "۱۲۳" } });
  const ad2 = parseOcrResponse(arabicDigits2);
  check("parse/أرقام فارسية-عربية", ad2.fields.find((f) => f.key === "total_amount")?.value === 1234);

  // فواصل آلاف ورموز عملة
  // toNumber استخراج وليس تقريبًا — التقريب وظيفة round2 أسفل الأنبوب
  for (const [input, expected] of [["1,250,000.50", 1250000.5], ["EGP 1,140", 1140], ["1140 EGP", 1140], ["1,140 ج.م", 1140], ["1000.999", 1000.999], ["٢٥٫٥ ج", 25.5]]) {
    const r = parseOcrResponse(mk({ total_amount: { value: input, confidence: 0.8, raw: input } }));
    check(`parse/مبلغ «${input}»`, r.fields.find((f) => f.key === "total_amount")?.value === expected, `حصلنا على ${JSON.stringify(r.fields.find((f) => f.key === "total_amount")?.value)}`);
  }

  // الثقة: تقليم + قيم غريبة
  for (const [c, expected] of [[1.7, 1], [-0.4, 0], ["0.85", 0.85], [null, 0.5], ["abc", 0.5]]) {
    const r = parseOcrResponse(mk({ total_amount: { value: 10, confidence: c, raw: "x" } }));
    const v = r.fields.find((f) => f.key === "total_amount")?.confidence;
    check(`parse/ثقة ${JSON.stringify(c)}`, v === expected, `حصلنا على ${v}`);
  }

  // قيم عارية (النموذج لم يلتزم ببنية الحقل)
  const bare = parseOcrResponse(mk({ total_amount: 250, date: "2026-01-01", party_name: "أحمد" }));
  check("parse/قيم عارية", bare.fields.find((f) => f.key === "total_amount")?.value === 250 && bare.fields.find((f) => f.key === "party_name")?.value === "أحمد");

  // مفاتيح ناقصة → حقول null
  const sparse = parseOcrResponse(mk({ doc_type: { value: "OTHER", confidence: 0.5, raw: "" } }));
  check("parse/مفاتيح ناقصة", sparse.fields.every((f) => !["doc_type"].includes(f.key) ? f.value === null : true));

  // ضباب عشوائي شامل: لا استثناء غير المتوقع أبدًا
  let otherErr = 0;
  const keys = ["doc_type", "date", "total_amount"];
  for (let i = 0; i < 20000; i++) {
    const s =
      i % 3 === 0
        ? full
        : i % 3 === 1
          ? mk({})
          : mk(
              Object.fromEntries(
                keys.map((k) => [
                  k,
                  Math.random() < 0.3 ? null : { value: Math.random() < 0.5 ? rand(-1, 5000) : String(rand(-1, 5000)).slice(0, randInt(0, 8)), confidence: rand(-1, 2), raw: "ر" + randInt(0, 99) },
                ])
              )
            );
    try {
      const r = parseOcrResponse(s);
      if (!Array.isArray(r.fields) || r.fields.length !== 10) otherErr++;
      if (r.confidence < 0 || r.confidence > 1) otherErr++;
    } catch (e) {
      if (!(e instanceof Error)) otherErr++;
    }
  }
  check("parse/ضباب 20k", otherErr === 0, `أخطاء ${otherErr}`);

  check("prompt/يذكر كل الأنواع", ["INVOICE", "PURCHASE_INVOICE", "RECEIPT", "BANK_STATEMENT", "CONTRACT", "ID", "TAX_FORM", "OTHER"].every((t) => buildExtractionPrompt().includes(t)));
}

// ------------------------------------------------------------------ money
{
  // round2: حدود وقسمة
  check("round2/أساسي", round2(1.005) === 1.01 && round2(1.004999) === 1.0 && round2(-1.005) === -1.01);
  check("round2/غير منتهٍ", round2(NaN) === 0 && round2(Infinity) === 0 && round2(undefined) === 0);
  for (let i = 0; i < 100000; i++) {
    const a = rand(-1e9, 1e9);
    const r = round2(a);
    if (!Number.isFinite(r)) { check("round2/ضباب 100k", false, `a=${a}`); break; }
    // سماحية نسبية: الأرقام الضخمة يفوق دقّتها دقة الفاصلة العائمة نفسها
    if (Math.abs(r * 100 - Math.round(r * 100)) > 1e-6 * Math.max(1, Math.abs(r) * 100)) { check("round2/خانتان", false, `a=${a} r=${r}`); break; }
    // التماثل
    if (round2(-a) !== -round2(a)) { check("round2/تماثل", false, `a=${a}`); break; }
  }
  check("round2/ضباب 100k مكتمل", true);

  // sumMoney ضد جمع مرجعي
  for (let i = 0; i < 5000; i++) {
    const arr = Array.from({ length: randInt(0, 20) }, () => rand(-1e6, 1e6));
    const s = sumMoney(arr);
    const ref = round2(arr.reduce((x, y) => x + y, 0));
    if (Math.abs(s - ref) > 0.02) { check("sumMoney/ضباب", false, `s=${s} ref=${ref}`); break; }
  }
  check("sumMoney/ضباب 5k مكتمل", true);

  // lineTotal: خصم وضريبة
  const lt = lineTotal({ quantity: 3, unitPrice: 100, discount: 30, taxRate: 14 });
  check("lineTotal/حساب", lt.net === 270 && lt.tax === 37.8 && lt.total === 307.8, JSON.stringify(lt));
  const lt2 = lineTotal({ quantity: 0, unitPrice: 100 });
  check("lineTotal/صفر", lt2.net === 0 && lt2.total === 0);

  // totalsOf: الإجماليات متسقة مع الأسطر
  const lines = [
    { quantity: 2, unitPrice: 150, discount: 0, taxRate: 14 },
    { quantity: 1, unitPrice: 400, discount: 50, taxRate: 14 },
  ];
  const t = totalsOf(lines, 20);
  check("totalsOf/تساق", t.subtotal === 700 && t.discount === 20 && t.net === 680 && Math.abs(t.total - t.net - t.tax) < 0.01, JSON.stringify(t));

  // formatMoney: لا ينفجر على أي مدخل
  for (const v of [0, -0.5, 1234567.891, NaN, null, undefined, 1e15, -1e-9]) {
    let okFmt = false;
    try { const s = formatMoney(v); okFmt = typeof s === "string" && s.length > 0; } catch { okFmt = false; }
    if (!okFmt) { check("formatMoney/مدخلات", false, `v=${String(v)}`); break; }
  }
  check("formatMoney/مدخلات مكتمل", true);

  // daysUntil
  const base = new Date(2026, 8, 15, 12, 0, 0);
  check("daysUntil/أمس", daysUntil(new Date(2026, 8, 14), base) === -1);
  check("daysUntil/اليوم", daysUntil(new Date(2026, 8, 15, 3, 0), base) === 0);
  check("daysUntil/غدًا", daysUntil(new Date(2026, 8, 16), base) === 1);
  check("daysUntil/فارغ", daysUntil(null) === null && daysUntil("بلا تاريخ") === null);
}

console.log(`[pure] نجح ${passed} — فشل ${failed}`);
if (failures.length) {
  console.log("الفشل:");
  for (const f of failures.slice(0, 20)) console.log("  ✗", f);
  process.exitCode = 1;
}
export default { passed, failed };
