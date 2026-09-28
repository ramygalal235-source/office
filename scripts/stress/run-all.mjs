// ===== اختبار الضغط الشامل: دفاتر المحاسب =====
// شلّة واحدة تجرّب النظام الفعلي:
//   1) pure         — منطق OCR والفئات النقدية تحت فوضى عشوائية (40k حالة)
//   2) queue        — السلسلة المشفّرة + الطابور الدائم + القواعد (كود حقيقي)
//   3) consistency  — تساقب الملفات: قواعد→معالجات، تنقّل→صفحات، API→routes
import { performance } from "node:perf_hooks";

const t0 = performance.now();
const results = [];

async function run(name, mod) {
  const t = performance.now();
  try {
    const r = (await import(mod)).default;
    results.push({ name, passed: r.passed, failed: r.failed, ms: Math.round(performance.now() - t) });
  } catch (err) {
    results.push({ name, passed: 0, failed: 1, ms: Math.round(performance.now() - t), error: String(err?.message ?? err) });
  }
}

console.log("==== اختبار ضغط دفاتر المحاسب ====");
await run("pure (OCR + money, 40k fuzz)", "./stress-pure.mjs");
await run("queue (chain + queue + rules)", "./stress-queue.mjs");
await run("consistency (cross-file)", "./stress-consistency.mjs");

const totalPassed = results.reduce((a, r) => a + r.passed, 0);
const totalFailed = results.reduce((a, r) => a + r.failed, 0);
console.log("\n==== الملخص ====");
for (const r of results) {
  console.log(`${r.failed ? "✗" : "✓"} ${r.name}: ${r.passed} نجاح / ${r.failed} فشل — ${r.ms}ms${r.error ? ` — ${r.error}` : ""}`);
}
console.log(`الإجمالي: ${totalPassed + totalFailed} فحصًا — نجح ${totalPassed} — فشل ${totalFailed} — ${Math.round(performance.now() - t0)}ms`);
process.exitCode = totalFailed > 0 ? 1 : 0;
