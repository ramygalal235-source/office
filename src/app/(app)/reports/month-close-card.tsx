"use client";

// ===== إغلاق الشهر: فحوصات الفترة ثم قفلها =====
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Lock, LockOpen, XCircle } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Check = { key: string; label: string; ok: boolean; blocking: boolean; detail: string };
type State = {
  year: number;
  month: number;
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  checks: Check[];
};

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function MonthCloseCard({ userRole }: { userRole: string }) {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const y = Number(year);
    const m = Number(month);
    const res = await apiFetch<State>(`/api/month-close?year=${y}&month=${m}`, { silent: true });
    if (res.ok && res.data) setState(res.data);
  }, [month, year]);

  useEffect(() => {
    setState(null);
    load();
  }, [load]);

  const close = async () => {
    setBusy(true);
    const res = await apiFetch(`/api/month-close`, {
      method: "POST",
      ...jsonBody({ year: Number(year), month: Number(month) }),
      silent: true,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(res.data?.skipped ? "الفترة مغلقة بالفعل" : `أُغلقت الفترة ${month}/${year} — أي قيد بتاريخ داخلها سيُرفض حتى إعادة الفتح`);
      load();
    } else {
      toast.error(res.error ?? "تعذّر الإغلاق");
    }
  };

  const reopen = async () => {
    if (!confirm(`إعادة فتح ${month}/${year}؟ سيُسمح بترحيل قيود بتاريخ داخلها مجددًا.`)) return;
    setBusy(true);
    const res = await apiFetch(`/api/month-close?year=${year}&month=${month}`, { method: "DELETE", silent: true });
    setBusy(false);
    if (res.ok) {
      toast.success("أُعيد فتح الفترة");
      load();
    } else {
      toast.error(res.error ?? "تعذّر إعادة الفتح");
    }
  };

  const blocked = (state?.checks ?? []).filter((c) => c.blocking && !c.ok);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lock className="size-4" />
          إغلاق الشهر
        </CardTitle>
        <CardDescription className="text-xs">
          الروتين الشهرية: افحص الفترة، ثم أغلقها — الإغلاق يمنع أي قيد بتاريخ داخلها حتى إعادة الفتح.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state && (
            <Badge variant={state.closed ? "success" : "info"}>
              {state.closed ? `مغلقة — ${state.closedAt ? new Date(state.closedAt).toLocaleString("ar-EG") : ""}` : "مفتوحة"}
            </Badge>
          )}
          <div className="ms-auto flex gap-2">
            {state?.closed ? (
              userRole === "admin" && (
                <Button size="sm" variant="outline" onClick={reopen} disabled={busy}>
                  <LockOpen className="size-4" />
                  إعادة الفتح
                </Button>
              )
            ) : (
              <Button size="sm" onClick={close} disabled={busy || state === null || blocked.length > 0}>
                {busy ? <Loader2 className="animate-spin size-4" /> : <Lock className="size-4" />}
                إغلاق {month}/{year}
              </Button>
            )}
          </div>
        </div>

        {state === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {state.checks.map((c) => (
              <div key={c.key} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${c.ok ? "" : "bg-destructive/5"}`}>
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <XCircle className={`mt-0.5 size-4 shrink-0 ${c.blocking ? "text-destructive" : "text-warning"}`} />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{c.label}</span>
                  {!c.blocking && <Badge variant="muted" className="ms-2 text-[10px]">تجريبي</Badge>}
                  <span className="block text-xs text-muted-foreground">{c.detail}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {state && !state.closed && blocked.length > 0 && (
          <p className="text-xs text-destructive">
            {blocked.length} فحص حاسم لم يمرّ — عالجها أولًا ({blocked.map((c) => c.label).join("، ")}).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
