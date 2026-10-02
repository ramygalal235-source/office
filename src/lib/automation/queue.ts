import { db } from "@/lib/db";
import { appendEvent } from "./event-log";

// ===== طابور المهام الدائم =====
//
// لماذا طابور في قاعدة البيانات بدل مؤقّتات في الذاكرة؟
// لأن النظام يجب أن ينجو من إعادة التشغيل: لا مهمة تضيع عند إغلاق الجهاز.
//
// لكل مهمة: إعادة محاولة تصاعدية، ومفتاح تكرار (idempotency) يمنع تنفيذ نفس
// العمل مرتين، وحالة «متعثّرة» (DEAD) عند نفاد المحاولات حتى لا تضيع صامتة
// بل تتحوّل إلى تنبيه يظهر لمن يملك الصلاحية.
//
// SQLite يسلسل عمليات الكتابة، لذا الحجز الذري أدناه آمن في تطبيق Node واحد.
// عند التوسّع لعدة أجهزة نحتاج PostgreSQL مع SELECT ... FOR UPDATE SKIP LOCKED.

export type JobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "DEAD";

export interface EnqueueInput {
  type: string;
  payload?: Record<string, unknown>;
  priority?: number;
  maxAttempts?: number;
  runAt?: Date;
  idempotencyKey?: string;
  sourceEventId?: string;
}

export async function enqueue(input: EnqueueInput) {
  // مفتاح التكرار موجود بالفعل؟ لا نُنشئ نفس العمل مرتين
  if (input.idempotencyKey) {
    const existing = await db.job.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { job: existing, created: false };
  }

  try {
    const job = await db.job.create({
      data: {
        type: input.type,
        payload: JSON.stringify(input.payload ?? {}),
        priority: input.priority ?? 100,
        maxAttempts: input.maxAttempts ?? 5,
        runAt: input.runAt ?? new Date(),
        idempotencyKey: input.idempotencyKey ?? null,
        sourceEventId: input.sourceEventId ?? null,
      },
    });
    return { job, created: true };
  } catch (err) {
    // سباق على نفس مفتاح التكرار: نرجع المهمة الموجودة بدل الفشل
    if (input.idempotencyKey) {
      const existing = await db.job.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return { job: existing, created: false };
    }
    throw err;
  }
}

/** يحجز حتى limit مهمة جاهزة للتنفيذ ويضعها RUNNING (ذرّي) */
export async function claim(limit = 5, workerId = `w-${process.pid}`) {
  const candidates = await db.job.findMany({
    where: {
      status: "PENDING",
      runAt: { lte: new Date() },
    },
    orderBy: [{ priority: "asc" }, { runAt: "asc" }],
    take: limit * 3, // نحجز أكثر قليلًا لتجاوز ما ويحجزه عامل آخر
    select: { id: true },
  });

  const claimed: string[] = [];
  for (const c of candidates) {
    if (claimed.length >= limit) break;
    // الحجز الذري: التحديث ينجح فقط إذا كانت المهمة ما تزال PENDING
    const res = await db.job.updateMany({
      where: { id: c.id, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: new Date(), lockedBy: workerId, attempts: { increment: 1 } },
    });
    if (res.count === 1) claimed.push(c.id);
  }

  if (!claimed.length) return [];
  return db.job.findMany({
    where: { id: { in: claimed }, status: "RUNNING", lockedBy: workerId },
    orderBy: [{ priority: "asc" }, { runAt: "asc" }],
  });
}

/** يعيد مهمة بعد فشل مع تصاعد في التأخير: 1د، 5د، 15د، ساعة... */
export async function fail(jobId: string, error: string, maxDelayMs = 60 * 60 * 1000) {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const exhausted = job.attempts >= job.maxAttempts;
  const backoff = Math.min(maxDelayMs, 1000 * Math.pow(5, Math.max(0, job.attempts - 1)));
  const status: JobStatus = exhausted ? "DEAD" : "PENDING";

  const updated = await db.job.update({
    where: { id: jobId },
    data: {
      status,
      lastError: error.slice(0, 2000),
      runAt: exhausted ? job.runAt : new Date(Date.now() + backoff),
      lockedAt: null,
      lockedBy: null,
      completedAt: exhausted ? new Date() : null,
    },
  });

  if (exhausted) {
    await appendEvent({
      action: "job.dead",
      entity: "Job",
      entityId: jobId,
      summary: `توقفت المهمة «${job.type}» بعد ${job.attempts} محاولات: ${error.slice(0, 200)}`,
      actorType: "system",
      payload: { type: job.type, attempts: job.attempts },
    });
    await db.notification.create({
      data: {
        role: "admin",
        kind: "JOB_FAILED",
        severity: "critical",
        title: `مهمة متوقفة: ${job.type}`,
        body: `فشلت ${job.attempts} محاولات متتالية. آخر خطأ: ${error.slice(0, 300)}`,
      },
    });
  }

  return updated;
}

export async function complete(jobId: string, result?: unknown, durationMs?: number) {
  return db.job.update({
    where: { id: jobId },
    data: {
      status: "DONE",
      completedAt: new Date(),
      durationMs,
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/** يعيد المهام العالقة (توقف التطبيق أثناء تشغيلها) إلى الطابور */
export async function requeueStale(olderThanMs = 5 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const res = await db.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null, runAt: new Date() },
  });
  return res.count;
}

export async function queueStats() {
  const [pending, running, done, dead, failed] = await Promise.all([
    db.job.count({ where: { status: "PENDING" } }),
    db.job.count({ where: { status: "RUNNING" } }),
    db.job.count({ where: { status: "DONE" } }),
    db.job.count({ where: { status: "DEAD" } }),
    db.job.count({ where: { status: "FAILED" } }),
  ]);
  const total = pending + running + done + dead + failed;
  return {
    pending,
    running,
    done,
    dead,
    failed,
    total,
    automationRate: total > 0 ? Math.round(((done + dead) / total) * 100) : 100,
  };
}
