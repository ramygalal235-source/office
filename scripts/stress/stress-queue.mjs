// ===== اختبار ضغط 2: العمود الفقري (event-log + queue + rules) =====
// ينفّذ الكود الفعلي على محاكاة Prisma تحاكي SQLite كاتبًا واحدًا.
// الفحوص: سلامة السلسلة المشفّرة (5000 حدث + عبث + موازاة)، طابور دائم
// (تكرار آمن، حجز ذرّي، تراجع تصاعدي، تعثّر، استعادة عالقة)، وقواعد
// (إطلاق حدث → مهمة، وجداول زمنية).
import { __reset, __stores } from "./stub-db.mjs";

const eventLog = await import("../../src/lib/automation/event-log.ts");
const queue = await import("../../src/lib/automation/queue.ts");
const rules = await import("../../src/lib/automation/rules.ts");

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

// ------------------------------------------------------------------ السلسلة المشفّرة
{
  __reset();
  const N = 5000;
  for (let i = 0; i < N; i++) {
    await eventLog.appendEvent({
      action: "stress.event",
      entity: "Stress",
      entityId: `e${i}`,
      summary: `حدث رقم ${i}`,
      payload: { i },
    });
  }
  const v1 = await eventLog.verifyChain(10000);
  check("chain/5000 حدث سليم", v1.ok && v1.checked === N, JSON.stringify(v1.breaks.slice(0, 2)));

  // عبث في حدث وسطي: يجب كشفه بالموضع الدقيق
  const events = [...__stores().eventLog.values()];
  const target = events.find((e) => e.seq === 1234);
  target.summary = "تم تعديل هذا الحدث يدويًا";
  const v2 = await eventLog.verifyChain(10000);
  check("chain/كشف العبث", !v2.ok && v2.breaks.some((b) => b.seq === 1234), JSON.stringify(v2.breaks.slice(0, 3)));

  // فجوة ترقيم: حذف حدث → السلسلة تكسر
  __reset();
  for (let i = 0; i < 50; i++) {
    await eventLog.appendEvent({ action: "a", entity: "B", summary: `s${i}` });
  }
  const gap = [...__stores().eventLog.values()].find((e) => e.seq === 25);
  __stores().eventLog.delete(gap.id);
  const v3 = await eventLog.verifyChain(100);
  check("chain/كشف فجوة الترقيم", !v3.ok && v3.breaks.some((b) => b.reason.includes("فجوة")));

  // موازاة: 300 إضافة متزامنة — القفل الأحادي يجب أن يحفظ التسلسل
  __reset();
  await Promise.all(
    Array.from({ length: 300 }, (_, i) =>
      eventLog.appendEvent({ action: "conc", entity: "C", entityId: `c${i}`, summary: `موازاة ${i}` })
    )
  );
  const v4 = await eventLog.verifyChain(1000);
  const seqs = [...__stores().eventLog.values()].map((e) => e.seq);
  const uniqueSeqs = new Set(seqs).size === 300;
  check("chain/300 إضافة موازية بلا تشعّب", v4.ok && uniqueSeqs, `ok=${v4.ok} unique=${uniqueSeqs}`);

  // الخط الزمني
  const tl = await eventLog.timeline("C", "c5", 10);
  check("chain/خط زمني", tl.length === 1 && tl[0].entityId === "c5");
}

// ------------------------------------------------------------------ الطابور
{
  __reset();
  // تكرار آمن: نفس المفتاح → مهمة واحدة
  const a = await queue.enqueue({ type: "t", payload: { x: 1 }, idempotencyKey: "k1" });
  const b = await queue.enqueue({ type: "t", payload: { x: 1 }, idempotencyKey: "k1" });
  check("queue/تكرار آمن", a.created === true && b.created === false && a.job.id === b.job.id);

  // أولوية: 20 مهمة بأولويات متباينة
  __reset();
  for (let i = 0; i < 20; i++) {
    await queue.enqueue({ type: "prio", payload: { i }, priority: 100 - (i % 5), runAt: new Date(Date.now() - 1000) });
  }
  const w1 = await queue.claim(5, "worker-A");
  check("queue/الحجز الأول", w1.length === 5 && w1.every((j) => j.status === "RUNNING" && j.attempts === 1));
  const w2 = await queue.claim(5, "worker-B");
  check("queue/لا حجز مزدوج", w1.every((j1) => w2.every((j2) => j1.id !== j2.id)));
  const w3 = await queue.claim(5, "worker-A");
  const w4 = await queue.claim(5, "worker-B");
  const w5 = await queue.claim(5, "worker-A");
  check("queue/نفاد الطابور بالتدريج", w3.length === 5 && w4.length === 5 && w5.length === 0, `w3=${w3.length} w4=${w4.length} w5=${w5.length}`);
  // أولوية: أدنى رقم أولوية يحجز أولًا
  const p1 = w1.map((x) => x.priority);
  check("queue/ترتيب الأولوية", p1.every((v, i) => i === 0 || p1[i - 1] <= v), JSON.stringify(p1));

  // تراجع تصاعدي: 1ث × 5^(المحاولة-1) — ثم تعثّر بعد 5 محاولات
  __reset();
  const j = (await queue.enqueue({ type: "flaky" })).job;
  const expected = [1000, 5000, 25000, 125000];
  for (let i = 0; i < 4; i++) {
    const claimed = await queue.claim(1, "w");
    check("queue/إعادة محاولة " + (i + 1), claimed.length === 1);
    const updated = await queue.fail(claimed[0].id, "فشل تجريبي");
    const backoff = updated.runAt.getTime() - Date.now();
    check(`queue/تأخير ${expected[i]}ms`, Math.abs(backoff - expected[i]) < 3000, `حصلنا على ${Math.round(backoff)}ms`);
    // محاكاة مرور الزمن: نرجع موعد التنفيذ إلى الماضي
    __stores().job.get(j.id).runAt = new Date(Date.now() - 1000);
  }
  const claimedLast = await queue.claim(1, "w");
  const dead = await queue.fail(claimedLast[0].id, "انتهت المحاولات");
  check("queue/التعثّر النهائي", dead.status === "DEAD" && dead.completedAt !== null && dead.attempts === 5);
  const notifications = [...__stores().notification.values()];
  check("queue/تنبيه التعثّر", notifications.length === 1 && notifications[0].severity === "critical" && notifications[0].kind === "JOB_FAILED");
  const deadEvents = [...__stores().eventLog.values()].filter((e) => e.action === "job.dead");
  check("queue/حدث job.dead", deadEvents.length === 1 && deadEvents[0].entityId === j.id);

  // الإكمال
  __reset();
  const j2 = (await queue.enqueue({ type: "ok" })).job;
  await queue.claim(1, "w");
  const done = await queue.complete(j2.id, { result: 42 }, 1234);
  check("queue/الإكمال", done.status === "DONE" && done.durationMs === 1234 && done.lockedBy === null);

  // استعادة العالقة: RUNNING قديمة → PENDING
  const stale = await queue.enqueue({ type: "stale" });
  await queue.claim(1, "w");
  const row = __stores().job.get(stale.job.id);
  row.lockedAt = new Date(Date.now() - 10 * 60000); // قبل 10 دقائق
  const reclaimed = await queue.requeueStale(5 * 60000);
  check("queue/استعادة العالقة", reclaimed === 1 && __stores().job.get(stale.job.id).status === "PENDING");

  // الإحصاءات
  const stats = await queue.queueStats();
  check("queue/إحصاءات متسقة", stats.total === stats.pending + stats.running + stats.done + stats.dead + stats.failed);
}

// ------------------------------------------------------------------ القواعد
{
  __reset();
  await rules.seedDefaultRules();
  const ruleCount = [...__stores().automationRule.values()].length;
  check("rules/9 قواعد افتراضية", ruleCount === 9, `حصلنا على ${ruleCount}`);

  // حدث CREATE على التزام → قاعدة obligation.prepare_tasks → مهمة
  const ev = await eventLog.record({ action: "CREATE", entity: "TaxObligation", entityId: "ob-1", summary: "التزام جديد" });
  const jobs = [...__stores().job.values()];
  check("rules/حدث → مهمة", jobs.length === 1 && jobs[0].type === "obligation.prepare_tasks");
  check("rules/حمولة الحدث", jobs[0].payload.includes("ob-1"));
  check("rules/مصدر المهمة", jobs[0].sourceEventId === ev.id);

  // حدث engagement.created → مهمة قائمة المهام
  await eventLog.record({ action: "CREATE", entity: "Engagement", entityId: "eng-1", summary: "ملف عمل" });
  const jobs2 = [...__stores().job.values()];
  check("rules/ملف عمل → قائمة مهام", jobs2.some((j) => j.type === "engagement.generate_checklist" && j.payload.includes("eng-1")));

  // تكرار: نفس الحدث لا يُنشئ مهمة ثانية (مفتاح تكرار بقاعدة)
  await eventLog.record({ action: "CREATE", entity: "TaxObligation", entityId: "ob-1", summary: "نفس الالتزام" });
  // الحدث مختلف (id جديد) لكنه يطابق نفس القاعدة: يجب مهمة جديدة (سلوك صحيح)
  // التكرار الحقيقي: نفس event.id — نحاكي استدعاء dispatchEvent مباشرة
  const r1 = await rules.dispatchEvent("obligation.created", { id: "fixed-id", payload: null, entity: "TaxObligation", entityId: "ob-1" });
  const r2 = await rules.dispatchEvent("obligation.created", { id: "fixed-id", payload: null, entity: "TaxObligation", entityId: "ob-1" });
  check("rules/تكرار نفس الحدث", r1.enqueued === 1 && r2.enqueued === 0);

  // جداول زمنية: cron صحيح يطلق، وخرق صلاحيات لا يفعل
  check("cron/كل 15 دقيقة", rules.cronMatches("*/15 * * * *", new Date(2026, 0, 1, 10, 15)) && !rules.cronMatches("*/15 * * * *", new Date(2026, 0, 1, 10, 10)));
  check("cron/ساعة محددة", rules.cronMatches("0 2 * * *", new Date(2026, 0, 1, 2, 0)) && !rules.cronMatches("0 2 * * *", new Date(2026, 0, 1, 3, 0)));
  check("cron/يوم وشهر", rules.cronMatches("30 8 1 * *", new Date(2026, 5, 1, 8, 30)) && !rules.cronMatches("30 8 1 * *", new Date(2026, 5, 2, 8, 30)));
  check("cron/نطاق", rules.cronMatches("0 9-17 * * 1-5", new Date(2026, 5, 4, 12, 0)) && !rules.cronMatches("0 9-17 * * 1-5", new Date(2026, 5, 6, 12, 0)));
  check("cron/قائمة", rules.cronMatches("0 6,12,18 * * *", new Date(2026, 0, 1, 18, 0)) && !rules.cronMatches("0 6,12,18 * * *", new Date(2026, 0, 1, 7, 0)));

  // ضباب: 20k جدول × 20k لحظة — لا استثناء أبدًا
  const fields = () => Array.from({ length: 5 }, () => {
    const kind = Math.random();
    if (kind < 0.3) return "*";
    if (kind < 0.5) return `*/${1 + Math.floor(Math.random() * 50)}`;
    if (kind < 0.7) return String(Math.floor(Math.random() * 60));
    if (kind < 0.85) return `${Math.floor(Math.random() * 50)}-${Math.floor(Math.random() * 60)}`;
    return Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => Math.floor(Math.random() * 60)).join(",");
  });
  let cronErr = 0;
  for (let i = 0; i < 20000; i++) {
    const expr = fields().join(" ");
    const at = new Date(Date.UTC(2026, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28), Math.floor(Math.random() * 24), Math.floor(Math.random() * 60)));
    try {
      if (typeof rules.cronMatches(expr, at) !== "boolean") cronErr++;
    } catch {
      cronErr++;
    }
  }
  check("cron/ضباب 20k", cronErr === 0, `أخطاء ${cronErr}`);

  // runDueSchedules: يطلق المهام المستحقة مرة واحدة فقط (مفتاح تكرار بالدقيقة)
  __reset();
  await rules.seedDefaultRules();
  const s1 = await rules.runDueSchedules(new Date(2026, 0, 1, 10, 15, 0));
  const s2 = await rules.runDueSchedules(new Date(2026, 0, 1, 10, 15, 30));
  const cronJobs = [...__stores().job.values()].filter((j) => j.idempotencyKey?.startsWith("cron:"));
  check("schedules/إطلاق مرة واحدة بالدقيقة", s1.enqueued >= 1 && s2.enqueued === 0 && cronJobs.length >= 1);
}

console.log(`[queue] نجح ${passed} — فشل ${failed}`);
if (failures.length) {
  console.log("الفشل:");
  for (const f of failures.slice(0, 20)) console.log("  ✗", f);
  process.exitCode = 1;
}
export default { passed, failed };
