"use client";

// ===== مطابقة البنك: سطور كشف البنك × سندات الدفتر على نفس الحساب =====
import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Landmark, Link2, Loader2, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { formatDate, formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BankTx = {
  id: string;
  date: string;
  reference: string | null;
  description: string | null;
  amount: number;
  direction: "IN" | "OUT";
  status: "UNMATCHED" | "MATCHED" | "IGNORED";
  matchedPayment: { id: string; number: string; amount: number; type: string; date: string; party: { name: string } | null } | null;
};

type BookPayment = {
  id: string;
  number: string;
  type: "IN" | "OUT";
  date: string;
  amount: number;
  party: { name: string } | null;
  reference: string | null;
  journalPosted: boolean;
};

const STATUS_LABELS: Record<BankTx["status"], { label: string; variant: "success" | "info" | "muted" }> = {
  MATCHED: { label: "مطابق", variant: "success" },
  UNMATCHED: { label: "بلا مطابقة", variant: "info" },
  IGNORED: { label: "مُتجاهَل", variant: "muted" },
};

const today = () => new Date().toISOString().slice(0, 10);

export function BankReconDialog({
  safeId,
  safeName,
  open,
  onOpenChange,
}: {
  safeId: string;
  safeName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [txs, setTxs] = useState<BankTx[]>([]);
  const [payments, setPayments] = useState<BookPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null); // سطر البنك الجارى اختيار سند له
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: today(), reference: "", description: "", amount: "", direction: "IN" });

  const load = useCallback(async () => {
    setLoading(true);
    const [txRes, payRes] = await Promise.all([
      apiFetch<BankTx[]>(`/api/bank-transactions?safeId=${safeId}`, { silent: true }),
      apiFetch<BookPayment[]>(`/api/payments?safeId=${safeId}&limit=100`, { silent: true }),
    ]);
    if (txRes.ok && Array.isArray(txRes.data)) setTxs(txRes.data);
    if (payRes.ok && Array.isArray(payRes.data)) setPayments(payRes.data);
    setLoading(false);
  }, [safeId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const matchedPaymentIds = new Set(txs.filter((t) => t.status === "MATCHED" && t.matchedPayment).map((t) => t.matchedPayment!.id));
  const candidatesFor = (tx: BankTx) =>
    payments.filter((p) => p.type === tx.direction && !matchedPaymentIds.has(p.id));

  async function addTx() {
    const amount = Number(form.amount);
    if (!form.date || !Number.isFinite(amount) || amount <= 0) {
      toast.error("أدخل التاريخ والمبلغ صحيحًا");
      return;
    }
    setBusy(true);
    const res = await apiFetch(`/api/bank-transactions`, {
      method: "POST",
      ...jsonBody({
        safeId,
        date: form.date,
        amount,
        direction: form.direction,
        reference: form.reference || null,
        description: form.description || null,
      }),
      silent: true,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("أُضيف سطر البنك");
      setForm((f) => ({ ...f, reference: "", description: "", amount: "" }));
      load();
    } else {
      toast.error(res.error ?? "تعذّرت الإضافة");
    }
  }

  async function act(txId: string, body: object) {
    setBusy(true);
    const res = await apiFetch(`/api/bank-transactions/${txId}`, { method: "POST", ...jsonBody(body), silent: true });
    setBusy(false);
    if (res.ok) {
      setPicking(null);
      load();
    } else {
      toast.error(res.error ?? "تعذّرت العملية");
    }
  }

  async function removeTx(tx: BankTx) {
    if (!confirm(`حذف سطر البنك ${formatMoney(tx.amount)} (${tx.date})؟`)) return;
    setBusy(true);
    const res = await apiFetch(`/api/bank-transactions/${tx.id}`, { method: "DELETE", silent: true });
    setBusy(false);
    if (res.ok) {
      toast.success("حُذف السطر");
      load();
    } else {
      toast.error(res.error ?? "تعذّر الحذف");
    }
  }

  const bankIn = txs.filter((t) => t.direction === "IN" && t.status !== "IGNORED").reduce((a, t) => a + t.amount, 0);
  const bankOut = txs.filter((t) => t.direction === "OUT" && t.status !== "IGNORED").reduce((a, t) => a + t.amount, 0);
  const bookIn = payments.filter((p) => p.type === "IN").reduce((a, p) => a + p.amount, 0);
  const bookOut = payments.filter((p) => p.type === "OUT").reduce((a, p) => a + p.amount, 0);
  const matchedCount = txs.filter((t) => t.status === "MATCHED").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="size-4" />
            مطابقة البنك — {safeName}
          </DialogTitle>
          <DialogDescription>
            ادخل أسطر كشف البنك ثم طابق كل سطر مع سند القبض/الصرف المماثل على نفس الحساب.
          </DialogDescription>
        </DialogHeader>

        {/* البنك مقابل الدفتر */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-secondary/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">وارد — كشف البنك</div>
            <div className="text-sm font-bold text-success">{formatMoney(bankIn)}</div>
          </div>
          <div className="rounded-lg border bg-secondary/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">صادر — كشف البنك</div>
            <div className="text-sm font-bold text-destructive">{formatMoney(bankOut)}</div>
          </div>
          <div className="rounded-lg border bg-secondary/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">وارد — سندات الدفتر</div>
            <div className="text-sm font-bold text-success">{formatMoney(bookIn)}</div>
          </div>
          <div className="rounded-lg border bg-secondary/40 p-2.5">
            <div className="text-[11px] text-muted-foreground">صادر — سندات الدفتر</div>
            <div className="text-sm font-bold text-destructive">{formatMoney(bookOut)}</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {matchedCount} سطرًا مطابقًا من أصل {txs.length} — الفارق بين الطرفين يشمل السندات غير المطابقة والفرق الطفيفة (رسوم بنكية مثلًا).
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* أسطر كشف البنك */}
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold">أسطر كشف البنك</div>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="p-2 text-start text-xs font-semibold">التاريخ</th>
                    <th className="p-2 text-start text-xs font-semibold">البيان</th>
                    <th className="p-2 text-start text-xs font-semibold">المبلغ</th>
                    <th className="p-2 text-start text-xs font-semibold">الحالة</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {txs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                        لا توجد أسطر بعد — أضفها من النموذج بالأسفل
                      </td>
                    </tr>
                  )}
                  {txs.map((t) => {
                    const st = STATUS_LABELS[t.status] ?? STATUS_LABELS.UNMATCHED;
                    const diff = t.matchedPayment ? t.matchedPayment.amount - t.amount : null;
                    return (
                      <tr key={t.id} className="border-t align-top">
                        <td className="whitespace-nowrap p-2 text-xs tabular">{formatDate(new Date(t.date))}</td>
                        <td className="p-2 text-xs">
                          {t.reference && <span className="font-mono text-[11px]" dir="ltr">{t.reference}</span>}
                          {t.description && <span className="block text-muted-foreground">{t.description}</span>}
                          {t.matchedPayment && (
                            <span className={`block text-[11px] ${Math.abs(diff ?? 0) > 0.005 ? "text-warning" : "text-success"}`}>
                              ↔ {t.matchedPayment.number} — {t.matchedPayment.party?.name ?? "—"}
                              {Math.abs(diff ?? 0) > 0.005 && ` (فرق ${formatMoney(Math.abs(diff!))})`}
                            </span>
                          )}
                        </td>
                        <td className={`whitespace-nowrap p-2 text-xs tabular font-medium ${t.direction === "IN" ? "text-success" : "text-destructive"}`}>
                          {formatMoney(t.amount)}
                        </td>
                        <td className="p-2">
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap p-2 text-end">
                          {t.status !== "MATCHED" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setPicking(picking === t.id ? null : t.id)}>
                              <Link2 className="size-3.5" />
                              مطابقة
                            </Button>
                          )}
                          {t.status === "MATCHED" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => act(t.id, { action: "unmatch" })}>
                              <Undo2 className="size-3.5" />
                              إلغاء
                            </Button>
                          )}
                          {t.status !== "IGNORED" && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" disabled={busy} onClick={() => act(t.id, { action: "ignore" })}>
                              تجاهل
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 px-1.5 text-destructive" disabled={busy} onClick={() => removeTx(t)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* اختيار السند المطابق */}
            {picking && (
              <div className="max-h-48 overflow-y-auto rounded-lg border bg-secondary/30 p-2">
                {candidatesFor(txs.find((t) => t.id === picking) ?? ({} as BankTx)).length === 0 ? (
                  <p className="p-2 text-center text-xs text-muted-foreground">لا توجد سندات بنفس الاتجاه غير المطابقة — أضف السند من شاشة السندات أولًا</p>
                ) : (
                  candidatesFor(txs.find((t) => t.id === picking) ?? ({} as BankTx)).map((p) => (
                    <button
                      key={p.id}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-xs hover:bg-accent"
                      onClick={() => act(picking, { action: "match", paymentId: p.id })}
                    >
                      <span>
                        <span className="font-mono" dir="ltr">{p.number}</span>
                        {p.party?.name && <span className="text-muted-foreground"> — {p.party.name}</span>}
                      </span>
                      <span className="whitespace-nowrap tabular">{formatDate(new Date(p.date))} · {formatMoney(p.amount)}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* إضافة سطر */}
            <div className="grid grid-cols-2 gap-2 rounded-lg border p-2.5 sm:grid-cols-6">
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Label className="text-[11px]">التاريخ</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} dir="ltr" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">رقم العملية</Label>
                <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} dir="ltr" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">المبلغ</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} dir="ltr" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[11px]">الاتجاه</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v as "IN" | "OUT" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">إيداع (وارد)</SelectItem>
                    <SelectItem value="OUT">سحب (صادر)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
                <Label className="text-[11px]">البيان</Label>
                <div className="flex gap-1">
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <Button size="sm" onClick={addTx} disabled={busy} title="إضافة السطر">
                    {busy ? <Loader2 className="animate-spin size-3.5" /> : <Plus className="size-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* سندات الدفتر */}
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold">سندات الدفتر (على هذا الحساب)</div>
            <div className="max-h-[430px] overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="p-2 text-start text-xs font-semibold">السند</th>
                    <th className="p-2 text-start text-xs font-semibold">الطرف</th>
                    <th className="p-2 text-start text-xs font-semibold">المبلغ</th>
                    <th className="p-2 text-start text-xs font-semibold">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-xs text-muted-foreground">
                        لا توجد سندات على هذا الحساب
                      </td>
                    </tr>
                  )}
                  {payments.map((p) => {
                    const matched = matchedPaymentIds.has(p.id);
                    const bankTx = txs.find((t) => t.matchedPayment?.id === p.id);
                    return (
                      <tr key={p.id} className="border-t">
                        <td className="whitespace-nowrap p-2 text-xs">
                          <span className="font-mono" dir="ltr">{p.number}</span>
                          <span className="block text-muted-foreground">{formatDate(new Date(p.date))}</span>
                        </td>
                        <td className="p-2 text-xs">{p.party?.name ?? "—"}</td>
                        <td className={`whitespace-nowrap p-2 text-xs tabular font-medium ${p.type === "IN" ? "text-success" : "text-destructive"}`}>
                          {formatMoney(p.amount)}
                        </td>
                        <td className="p-2">
                          {matched ? (
                            <Badge variant="success">مطابق{bankTx ? ` — ${formatDate(new Date(bankTx.date))}` : ""}</Badge>
                          ) : (
                            <Badge variant="info">بلا مطابقة</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <ArrowLeftRight className="size-3" />
              المطابقة تتم من زر «مطابقة» على سطر البنك — اختر السند المماثل بالاتجاه نفسه.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
