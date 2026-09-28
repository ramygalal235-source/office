"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2, Play, ShieldCheck, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { formatDate } from "@/lib/money";

interface TickResult {
  skipped?: boolean;
  reason?: string;
  scheduled?: number;
  claimed?: number;
  done?: number;
  failed?: number;
  dead?: number;
}

interface Status {
  queue: { pending: number; running: number; done: number; dead: number; total: number; automationRate: number };
  rules: { total: number; enabled: number };
  deadJobs: number;
  unreadNotifications: number;
  last24h: { completed: number; dead: number; successRate: number };
  recent: { id: string; type: string; status: string; attempts: number; durationMs: number | null; lastError: string | null; createdAt: string; completedAt: string | null }[];
}

const STATUS_VARIANT: Record<string, "muted" | "info" | "success" | "destructive" | "warning"> = {
  PENDING: "muted",
  RUNNING: "info",
  DONE: "success",
  FAILED: "warning",
  DEAD: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "بالانتظار",
  RUNNING: "قيد التنفيذ",
  DONE: "تمت",
  FAILED: "أُعيدت",
  DEAD: "متعثّرة",
};

export function ControlTower() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [chain, setChain] = useState<{ ok: boolean; checked: number; breaks: { seq: number; reason: string }[] } | null>(null);
  const [running, setRunning] = useState(false);

  async function load() {
    const [s, c] = await Promise.all([
      apiFetch<Status>("/api/automation/status"),
      apiFetch<{ ok: boolean; checked: number; breaks: { seq: number; reason: string }[] }>("/api/automation/chain", { silent: true }),
    ]);
    if (s.ok && s.data) setStatus(s.data);
    if (c.ok && c.data) setChain(c.data);
  }

  useEffect(() => {
    load();
    // تحديث دوري خفيف حتى تبقى اللوحة حيّة
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  async function runNow() {
    setRunning(true);
    const res = await apiFetch<TickResult>("/api/automation/tick", { method: "POST" });
    setRunning(false);
    if (res.ok) {
      if (res.data?.skipped) return;
      await load();
      router.refresh();
    }
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ قراءة حالة النظام...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <h2 className="text-lg font-bold">برج المراقبة</h2>
          <Badge variant={status.queue.pending > 0 ? "info" : "success"}>
            {status.queue.pending > 0 ? `${status.queue.pending} مهمة في الطابور` : "لا مهام معلّقة"}
          </Badge>
        </div>
        <Button onClick={runNow} disabled={running} size="sm">
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          تشغيل دورة الآن
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="نسبة الإنجاز آخر 24 ساعة"
          value={`${status.last24h.successRate}%`}
          hint={`${status.last24h.completed} مهمة مكتملة`}
          tone={status.last24h.successRate >= 95 ? "success" : "warning"}
        />
        <StatCard
          label="القواعد المفعّلة"
          value={`${status.rules.enabled} / ${status.rules.total}`}
          hint="قواعد تعمل بلا تدخل بشري"
        />
        <StatCard
          label="مهام متعثّرة"
          value={String(status.deadJobs)}
          hint="تحتاج تدخل بشري"
          tone={status.deadJobs > 0 ? "destructive" : "success"}
        />
        <StatCard
          label="تنبيهات غير مقروءة"
          value={String(status.unreadNotifications)}
          tone={status.unreadNotifications > 0 ? "warning" : "default"}
        />
      </section>

      {/* سلامة سجل الأحداث */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">سلامة سجل الأحداث</CardTitle>
          {chain &&
            (chain.ok ? (
              <Badge variant="success">
                <ShieldCheck className="size-3" /> السلسلة سليمة ({chain.checked} حدث)
              </Badge>
            ) : (
              <Badge variant="destructive">
                <ShieldAlert className="size-3" /> {chain.breaks.length} موضع مشبوه
              </Badge>
            ))}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            كل حدث مرتبط بالحدث السابق بتجزئة مشفّرة. أي تعديل على سجل سابق يكسر السلسلة
            ويُكتشف تلقائيًا — هذا هو ما يجعل «100% قابل للتتبع» وعدًا قابلًا للتحقق.
          </p>
          {chain && !chain.ok && (
            <ul className="mt-3 flex flex-col gap-1 text-xs text-destructive">
              {chain.breaks.slice(0, 5).map((b) => (
                <li key={b.seq}>
                  <span className="tabular font-semibold">#{b.seq}</span> — {b.reason}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* آخر المهام */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">آخر عمليات النظام الآلي</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {status.recent.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              لم تُنفَّذ أي مهمة بعد. افتح لوحة التحكم أو اضغط «تشغيل دورة الآن».
            </p>
          ) : (
            <ul className="divide-y">
              {status.recent.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{job.type}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(job.createdAt)}
                      {job.durationMs != null && ` • ${job.durationMs}ms`}
                      {job.attempts > 1 && ` • ${job.attempts} محاولات`}
                    </span>
                    {job.lastError && (
                      <span className="truncate text-xs text-destructive">{job.lastError}</span>
                    )}
                  </div>
                  <Badge variant={STATUS_VARIANT[job.status] ?? "muted"}>
                    {STATUS_LABELS[job.status] ?? job.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
