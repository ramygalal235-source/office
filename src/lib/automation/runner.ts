import { db } from "@/lib/db";
import { getHandler, registeredJobTypes } from "./handlers";
import { appendEvent } from "./event-log";
import { claim, complete, fail, requeueStale } from "./queue";
import { runDueSchedules } from "./rules";

// ===== عامل التنفيذ =====
//
// نقطة واحدة فقط في النظام تنفّذ المهام. هذا مقصود: التنفيذ المتوازي يجعل
// ترتيب الأحداث غير متوقع، ومكتب محاسبي يحتاج ترتيبًا معلومًا.
//
// يُستدعى من /api/automation/tick — أي cron خارجي أو تبويب مفتوح يكفي.
// لا نحتاج عملية دائمة، فالنظام يعمل حتى لو لم يعمل شيء لثوانٍ.

export interface TickResult {
  scheduled: number;
  claimed: number;
  done: number;
  failed: number;
  dead: number;
  results: { type: string; ok: boolean; error?: string; durationMs: number }[];
}

export async function tick(options: { limit?: number; runSchedules?: boolean } = {}): Promise<TickResult> {
  const limit = options.limit ?? 10;
  const summary: TickResult = {
    scheduled: 0,
    claimed: 0,
    done: 0,
    failed: 0,
    dead: 0,
    results: [],
  };

  // المهام العالقة من تشغيل سابق (توقف مفاجئ) تعود للطابور
  await requeueStale();

  if (options.runSchedules !== false) {
    const sched = await runDueSchedules();
    summary.scheduled = sched.enqueued;
  }

  const jobs = await claim(limit);
  summary.claimed = jobs.length;

  for (const job of jobs) {
    const started = Date.now();
    const handler = getHandler(job.type);

    if (!handler) {
      // نوع غير معروف: هذه برمجة لا بيانات — نوقفها فورًا بلا إعادة محاولة
      await fail(job.id, `لا يوجد معالج مسجَّل للنوع «${job.type}»`, 0);
      await db.job.update({ where: { id: job.id }, data: { status: "DEAD" } });
      summary.dead += 1;
      summary.results.push({ type: job.type, ok: false, error: "معالج غير معروف", durationMs: 0 });
      continue;
    }

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(job.payload);
    } catch {
      payload = {};
    }

    const run = await db.jobRun.create({
      data: { jobId: job.id, attempt: job.attempts, startedAt: new Date() },
    });

    try {
      const result = await handler(payload);
      const durationMs = Date.now() - started;
      await complete(job.id, result, durationMs);
      await db.jobRun.update({
        where: { id: run.id },
        data: { endedAt: new Date(), ok: true, result: JSON.stringify(result ?? null).slice(0, 4000) },
      });
      summary.done += 1;
      summary.results.push({ type: job.type, ok: true, durationMs });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - started;
      const updated = await fail(job.id, message);
      await db.jobRun.update({
        where: { id: run.id },
        data: { endedAt: new Date(), ok: false, error: message.slice(0, 2000) },
      });
      summary.results.push({ type: job.type, ok: false, error: message, durationMs });

      if (updated?.status === "DEAD") summary.dead += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}

export function health() {
  return {
    handlers: registeredJobTypes(),
    handlerCount: registeredJobTypes().length,
  };
}

/** تشغيل متواصل في الخلفية — اختياري، مفيد في وضع التطوير */
export function startLoop(intervalMs = 30_000) {
  let running = false;

  const loop = async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error("automation tick failed:", err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(loop, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
