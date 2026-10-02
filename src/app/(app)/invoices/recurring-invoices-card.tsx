"use client";

// ===== الفواتير المتكررة: نماذج تولّد مسودة فاتورة تلقائيًا عند كل استحقاق =====
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { formatDate, formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

type Recurring = {
  id: string;
  name: string;
  customerId: string | null;
  customer: { id: string; name: string } | null;
  amount: number;
  frequency: string;
  notes: string | null;
  active: boolean;
  nextDueDate: string;
  lastGeneratedAt: string | null;
};

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: "شهري",
  QUARTERLY: "ربع سنوي",
  ANNUALLY: "سنوي",
};

const EMPTY_FORM = { name: "", customerId: "", amount: "", frequency: "MONTHLY", nextDueDate: "", notes: "" };

function isDue(dateStr: string) {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return new Date(dateStr) <= endOfToday;
}

export function RecurringInvoicesCard({
  customers,
  isAdmin,
}: {
  customers: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const [rows, setRows] = useState<Recurring[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [genBusyId, setGenBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    const res = await apiFetch<Recurring[]>("/api/recurring-invoices", { silent: true });
    if (res.ok && Array.isArray(res.data)) setRows(res.data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, nextDueDate: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  };

  const openEdit = (r: Recurring) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      customerId: r.customerId ?? "",
      amount: String(r.amount),
      frequency: r.frequency,
      nextDueDate: r.nextDueDate.slice(0, 10),
      notes: r.notes ?? "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.amount || !form.nextDueDate) {
      toast.error("الاسم والمبلغ وتاريخ أول استحقاق مطلوب");
      return;
    }
    setBusy(true);
    const body = {
      name: form.name.trim(),
      customerId: form.customerId || null,
      amount: Number(form.amount),
      frequency: form.frequency,
      nextDueDate: form.nextDueDate,
      notes: form.notes || null,
    };
    const res = editingId
      ? await apiFetch(`/api/recurring-invoices/${editingId}`, { method: "PUT", ...jsonBody(body), silent: true })
      : await apiFetch("/api/recurring-invoices", { method: "POST", ...jsonBody(body), silent: true });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر الحفظ");
      return;
    }
    toast.success(editingId ? "تم التحديث" : "أُضيف النموذج — سيُولَّد تلقائيًا عند كل استحقاق");
    setFormOpen(false);
    load();
  };

  const remove = async (r: Recurring) => {
    if (!confirm(`حذف النموذج «${r.name}»؟ الفواتير المتولّدة تبقى كما هي.`)) return;
    const res = await apiFetch(`/api/recurring-invoices/${r.id}`, { method: "DELETE", silent: true });
    if (res.ok) {
      toast.success("حُذف النموذج");
      load();
    } else {
      toast.error(res.error ?? "تعذّر الحذف");
    }
  };

  const toggleActive = async (r: Recurring) => {
    const res = await apiFetch(`/api/recurring-invoices/${r.id}`, {
      method: "PUT",
      ...jsonBody({ active: !r.active }),
      silent: true,
    });
    if (res.ok) load();
    else toast.error(res.error ?? "تعذّر التحديث");
  };

  const generateNow = async (r: Recurring) => {
    setGenBusyId(r.id);
    const res = await apiFetch<{ created: number; invoices: { invoiceNumber: string }[] }>(
      `/api/recurring-invoices/${r.id}`,
      { method: "POST", ...jsonBody({ action: "generate" }), silent: true }
    );
    setGenBusyId(null);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر التوليد");
      return;
    }
    if (res.data?.created) {
      toast.success(`وُلِّدت ${res.data.created} فاتورة: ${res.data.invoices.map((i) => i.invoiceNumber).join("، ")}`);
    } else {
      toast.success("لا استحقاق مستحق الآن");
    }
    load();
  };

  const activeCount = rows?.filter((r) => r.active).length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="size-4" />
            الفواتير المتكررة
          </CardTitle>
          <CardDescription className="text-xs">
            نماذج (إيجار، اشتراك، أتعاب ثابتة…) تولّد مسودة فاتورة تلقائيًا عند كل استحقاق — {activeCount} نشط
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="size-4" />
          نموذج جديد
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rows === null ? (
          <div className="flex justify-center p-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            لا توجد فواتير متكررة — أنشئ نموذجًا ليُولَّد تلقائيًا كل فترة (شهري/ربع سنوي/سنوي).
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((r) => {
              const due = isDue(r.nextDueDate);
              return (
                <div key={r.id} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm ${!r.active ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{r.name}</span>
                    {r.customer && <span className="text-muted-foreground"> — {r.customer.name}</span>}
                    <span className="block text-xs text-muted-foreground">
                      {FREQ_LABELS[r.frequency] ?? r.frequency} · {formatMoney(r.amount)}
                      {r.lastGeneratedAt && <> · آخر توليد {formatDate(new Date(r.lastGeneratedAt))}</>}
                    </span>
                  </div>
                  <Badge variant={r.active ? (due ? "warning" : "info") : "muted"}>
                    {r.active ? `التالي: ${formatDate(new Date(r.nextDueDate))}${due ? " — مستحق" : ""}` : "متوقف"}
                  </Badge>
                  {r.active && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="توليد الآن" onClick={() => generateNow(r)} disabled={genBusyId === r.id}>
                      {genBusyId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                      توليد
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleActive(r)} disabled={busy}>
                    {r.active ? "إيقاف" : "تفعيل"}
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(r)} title="تعديل">
                    <Pencil className="size-3.5" />
                  </Button>
                  {isAdmin && (
                    <Button size="icon" variant="ghost" className="size-7 text-destructive" onClick={() => remove(r)} title="حذف">
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل نموذج متكرر" : "نموذج متكرر جديد"}</DialogTitle>
            <DialogDescription>عند كل استحقاق تولَّد مسودة فاتورة (تُرحّل يدويًا كما ترحّل أي فاتورة).</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>الاسم *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="إيجار المكتب…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>العميل</Label>
              <Select value={form.customerId || "none"} onValueChange={(v) => setForm({ ...form, customerId: v === "none" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder="اختياري…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>المبلغ *</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} dir="ltr" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>الفترة</Label>
                <Select value={form.frequency} onValueChange={(v) => setForm({ ...form, frequency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQ_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>أول استحقاق *</Label>
              <Input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={busy}>
              {busy ? "جارٍ الحفظ…" : editingId ? "حفظ التعديلات" : "إضافة النموذج"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
