"use client";

// ===== أفعال أصل ثابت: إهلاك فترة / سجل الإهلاك / صرف =====
import { useState } from "react";
import { useRouter } from "next/navigation";
import { History, Loader2, MoreHorizontal, Send, Trash2, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Entry = {
  periodYear: number;
  periodMonth: number | null;
  amount: number;
  accumAfter: number;
  journalEntryId: string | null;
};

export function AssetRowActions({
  id,
  status,
  fullyDepreciated,
  canAct,
  acquisitionPosted,
  hasAccount,
  safes,
}: {
  id: string;
  status: string;
  fullyDepreciated: boolean;
  canAct: boolean;
  acquisitionPosted: boolean;
  hasAccount: boolean;
  safes: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [safeId, setSafeId] = useState("");
  const [disposeOpen, setDisposeOpen] = useState(false);
  const [proceeds, setProceeds] = useState("");
  const [disposeSafeId, setDisposeSafeId] = useState("");
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  async function depreciate() {
    setBusy(true);
    const res = await apiFetch<{ message: string }>(`/api/assets/${id}/depreciate`, {
      method: "POST",
      ...jsonBody({ year: Number(year), month: Number(month) }),
      silent: true,
    });
    setBusy(false);
    setPeriodOpen(false);
    if (res.ok && res.data?.message) toast.success(res.data.message);
    else toast.error(res.error ?? "تعذّر الإهلاك");
    router.refresh();
  }

  async function openHistory() {
    setHistoryOpen(true);
    setEntries(null);
    const res = await apiFetch<{ depreciations: Entry[] }>(`/api/assets/${id}`);
    if (res.ok && res.data) setEntries(res.data.depreciations);
    else toast.error(res.error ?? "تعذّر تحميل السجل");
  }

  async function postAcquisition() {
    if (busy || !safeId) return;
    if (!confirm(`ترحيل قيد الاستحواذ؟ مدين حساب الأصل — دائن ${safes.find((x) => x.id === safeId)?.label ?? ""}.`)) return;
    setBusy(true);
    const res = await apiFetch<{ message?: string; journalNumber?: string }>(`/api/assets/${id}/post`, {
      method: "POST",
      ...jsonBody({ safeId }),
      silent: true,
    });
    setBusy(false);
    setPostOpen(false);
    if (res.ok && res.data?.message) toast.success(res.data.message);
    else toast.error(res.error ?? "تعذّر الترحيل");
    router.refresh();
  }

  async function dispose() {
    if (busy) return;
    const hasProceeds = Number(proceeds) > 0;
    if (hasProceeds && !disposeSafeId) {
      toast.error("قيمة بيع مذكورة — حدد الخزينة/البنك");
      return;
    }
    setBusy(true);
    const res = await apiFetch<{ message: string }>(`/api/assets/${id}/dispose`, {
      method: "POST",
      ...jsonBody({ proceeds: hasProceeds ? Number(proceeds) : 0, safeId: hasProceeds ? disposeSafeId : undefined }),
      silent: true,
    });
    setBusy(false);
    setDisposeOpen(false);
    setProceeds("");
    setDisposeSafeId("");
    if (res.ok && res.data?.message) toast.success(res.data.message);
    else toast.error(res.error ?? "تعذّر الصرف");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={openHistory}>
            <History />
            سجل الإهلاك
          </DropdownMenuItem>
          {canAct && !acquisitionPosted && (
            <DropdownMenuItem
              disabled={!hasAccount}
              onClick={() => (hasAccount ? setPostOpen(true) : toast.error("اربط الأصل بحساب من دليل الحسابات أولًا"))}
            >
              <Send />
              ترحيل قيد الاستحواذ
            </DropdownMenuItem>
          )}
          {canAct && status === "ACTIVE" && !fullyDepreciated && (
            <DropdownMenuItem onClick={() => setPeriodOpen(true)}>
              <TrendingDown />
              إهلاك فترة
            </DropdownMenuItem>
          )}
          {canAct && status === "ACTIVE" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={() => setDisposeOpen(true)}>
                <Trash2 />
                صرف / إتلاف
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إهلاك عن فترة</DialogTitle>
            <DialogDescription>
              يرحّل قيد: مدين «مصروف إهلاك أصول ثابتة» — دائن «مجمع الإهلاك».
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>الشهر</Label>
              <Input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>السنة</Label>
              <Input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPeriodOpen(false)}>إلغاء</Button>
            <Button onClick={depreciate} disabled={busy}>{busy ? "جارٍ الترحيل..." : "ترحيل الإهلاك"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>سجل الإهلاك</DialogTitle>
            <DialogDescription>كل فترات الإهلاك المرخّلة لهذا الأصل.</DialogDescription>
          </DialogHeader>
          {entries === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> جارٍ التحميل...
            </div>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد فترات إهلاك بعد.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="p-2 text-start text-xs font-semibold">الفترة</th>
                    <th className="p-2 text-start text-xs font-semibold">الإهلاك</th>
                    <th className="p-2 text-start text-xs font-semibold">المجمع بعد الإهلاك</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-t">
                      <td className="tabular p-2">{e.periodMonth}/{e.periodYear}</td>
                      <td className="tabular p-2 font-medium">{formatMoney(e.amount)}</td>
                      <td className="tabular p-2">{formatMoney(e.accumAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
