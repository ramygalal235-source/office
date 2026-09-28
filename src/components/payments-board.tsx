"use client";

// ===== شاشة التحصيل والدفع =====
// سند قبض (IN) أو صرف (OUT) يحدد موقعه النقدي. الترحيل إلى قيود اليومية
// قرار واضح بزر واحد — والسند لا يُحذف بعد الترحيل (عكس القيد أولًا).
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, Plus, ScrollText, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { PAYMENT_METHODS, PAYMENT_TYPES } from "@/lib/domain";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BoardPayment {
  id: string;
  number: string;
  type: "IN" | "OUT";
  partyId: string | null;
  partyName: string | null;
  safeId: string | null;
  safeName: string | null;
  date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  journalPosted: boolean;
}

const METHOD_LABELS: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

const EMPTY_FORM = {
  type: "IN",
  partyId: "",
  safeId: "",
  date: new Date().toISOString().slice(0, 10),
  amount: "",
  method: "CASH",
  reference: "",
  notes: "",
};

export function PaymentsBoard({
  initialPayments,
  parties,
  safes,
  userRole,
}: {
  initialPayments: BoardPayment[];
  parties: { id: string; name: string; type: string }[];
  safes: { id: string; name: string; type: string }[];
  userRole: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<BoardPayment[]>(initialPayments);
  const [fType, setFType] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const filtered = useMemo(() => rows.filter((p) => !fType || p.type === fType), [rows, fType]);

  const totals = useMemo(() => {
    const inSum = filtered.filter((p) => p.type === "IN").reduce((s, p) => s + p.amount, 0);
    const outSum = filtered.filter((p) => p.type === "OUT").reduce((s, p) => s + p.amount, 0);
    return { inSum, outSum };
  }, [filtered]);

  const refresh = useCallback(async () => {
    const res = await apiFetch<Record<string, unknown>[]>("/api/payments?take=300", { silent: true });
    if (res.ok && Array.isArray(res.data)) {
      setRows(
        res.data.map((p) => ({
          id: p.id as string,
          number: p.number as string,
          type: (p.type as "IN" | "OUT") ?? "IN",
          partyId: (p.partyId as string | null) ?? null,
          partyName: ((p.party as { name?: string } | null)?.name) ?? null,
          safeId: (p.safeId as string | null) ?? null,
          safeName: ((p.safe as { name?: string } | null)?.name) ?? null,
          date: (p.date as string) ?? "",
          amount: (p.amount as number) ?? 0,
          method: (p.method as string) ?? "CASH",
          reference: (p.reference as string | null) ?? null,
          notes: (p.notes as string | null) ?? null,
          journalPosted: Boolean(p.journalPosted),
        }))
      );
    }
    router.refresh();
  }, [router]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  // الطرف المناسب لنوع السند: تحصيل من عملاء، ودفع لموردين (مع السماح بالآخر)
  const partyOptions = useMemo(() => {
    const primary = parties.filter((p) => (form.type === "IN" ? p.type === "CUSTOMER" : p.type === "SUPPLIER"));
    const secondary = parties.filter((p) => (form.type === "IN" ? p.type === "SUPPLIER" : p.type === "CUSTOMER"));
    return [...primary, ...secondary];
  }, [parties, form.type]);

  const save = async () => {
    if (!form.safeId) {
      toast.error("اختر الخزينة أو الحساب البنكي");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("المبلغ يجب أن يكون أكبر من صفر");
      return;
    }
    setSaving(true);
    const body = {
      type: form.type,
      partyId: form.partyId || null,
      safeId: form.safeId,
      date: form.date,
      amount: Number(form.amount),
      method: form.method,
      reference: form.reference || null,
      notes: form.notes || null,
    };
    const res = await apiFetch("/api/payments", { method: "POST", body: JSON.stringify(body), silent: true });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر الحفظ");
      return;
    }
    toast.success("تم إنشاء السند — رحّله إلى قيود اليومية");
    setFormOpen(false);
    await refresh();
  };

  const post = async (p: BoardPayment) => {
    const res = await apiFetch(`/api/payments/${p.id}/post`, { method: "POST", silent: true });
    if (res.ok) {
      toast.success(`رُحِّل السند ${p.number} إلى قيود اليومية`);
      await refresh();
    } else {
      toast.error(res.error ?? "تعذّر الترحيل");
    }
  };

  const remove = async (p: BoardPayment) => {
    if (!window.confirm(`حذف السند ${p.number}؟`)) return;
    const res = await apiFetch(`/api/payments/${p.id}`, { method: "DELETE", silent: true });
    if (res.ok) {
      toast.success("حُذف السند");
      await refresh();
    } else {
      toast.error(res.error ?? "تعذّر الحذف");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ملخص */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-success/12">
                <ArrowDownLeft className="size-4.5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي التحصيل (قبض)</p>
                <p className="text-lg font-bold text-success">{formatMoney(totals.inSum)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/12">
                <ArrowUpRight className="size-4.5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الدفع (صرف)</p>
                <p className="text-lg font-bold text-destructive">{formatMoney(totals.outSum)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          سند جديد
        </Button>
        <Select value={fType || "all"} onValueChange={(v) => setFType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {PAYMENT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refresh().catch(() => {})}>
          تحديث
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="p-3 text-start font-medium">السند</th>
                <th className="p-3 text-start font-medium">النوع</th>
                <th className="p-3 text-start font-medium">الطرف</th>
                <th className="p-3 text-start font-medium">الموقع</th>
                <th className="p-3 text-start font-medium">التاريخ</th>
                <th className="p-3 text-start font-medium">الطريقة</th>
                <th className="p-3 text-start font-medium">المبلغ</th>
                <th className="p-3 text-start font-medium">القيود</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <ScrollText className="size-8" />
                    لا توجد سندات بعد — أنشئ أول سند قبض أو صرف
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="p-3 font-mono text-xs">{p.number}</td>
                  <td className="p-3">
                    <Badge variant={p.type === "IN" ? "success" : "destructive"}>
                      {p.type === "IN" ? "قبض" : "صرف"}
                    </Badge>
                  </td>
                  <td className="p-3">{p.partyName ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3 text-xs">{p.safeName ?? "—"}</td>
                  <td className="p-3 text-xs">{new Date(p.date).toLocaleDateString("ar-EG")}</td>
                  <td className="p-3 text-xs">{METHOD_LABELS[p.method] ?? p.method}</td>
                  <td className={`p-3 font-medium ${p.type === "IN" ? "text-success" : "text-destructive"}`}>
                    {p.type === "IN" ? "+" : "−"} {formatMoney(p.amount)}
                  </td>
                  <td className="p-3">
                    {p.journalPosted ? (
                      <Badge variant="muted">مرحّل</Badge>
                    ) : (
                      <Badge variant="warning">بانتظار الترحيل</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      {!p.journalPosted && (
                        <Button size="sm" variant="outline" onClick={() => post(p)}>
                          ترحيل
                        </Button>
                      )}
                      {!p.journalPosted && userRole === "admin" && (
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(p)} title="حذف">
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>سند جديد</DialogTitle>
            <DialogDescription>تحصيل من عميل أو دفع لمورد — يُحدَّد الموقع النقدي ويُرحَّل بزر واحد.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>النوع</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>الموقع النقدي *</Label>
              <Select value={form.safeId || "none"} onValueChange={(v) => set("safeId", v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">اختر…</SelectItem>
                  {safes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.type === "BANK" ? "بنك" : "نقد"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>الطرف (اختياري)</Label>
              <Select value={form.partyId || "none"} onValueChange={(v) => set("partyId", v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="بدون طرف…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون طرف (حركة داخلية)</SelectItem>
                  {partyOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>التاريخ</Label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>المبلغ *</Label>
              <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => set("amount", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>طريقة الدفع</Label>
              <Select value={form.method} onValueChange={(v) => set("method", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>مرجع (رقم الشيك/التحويل — اختياري)</Label>
              <Input value={form.reference} onChange={(e) => set("reference", e.target.value")} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving}>
              {saving ? "جارٍ الحفظ…" : "إنشاء السند"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
