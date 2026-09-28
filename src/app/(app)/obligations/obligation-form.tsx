"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { OBLIGATION_STATUSES, OBLIGATION_TYPE_LABELS } from "@/lib/domain";
import { obligationStatusLabel } from "@/components/status-badge";

type Company = { id: string; nameAr: string; code: string };

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  OBLIGATION_STATUSES.map((s) => [s, obligationStatusLabel(s).label])
);

const EMPTY = {
  companyId: "",
  type: "VAT",
  title: "",
  period: "",
  periodYear: new Date().getFullYear(),
  periodMonth: new Date().getMonth() + 1,
  dueDate: "",
  amountDue: "",
  amountPaid: "",
  status: "PENDING",
  referenceNumber: "",
  notes: "",
};

export function ObligationForm({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const res = await apiFetch("/api/obligations", {
      method: "POST",
      ...jsonBody(form),
      successMessage: "تمت إضافة الالتزام الضريبي",
    });
    setSaving(false);
    if (res.ok) {
      setForm(EMPTY);
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> التزام جديد
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إضافة التزام ضريبي</DialogTitle>
          <DialogDescription>
            سجّل الاستحقاق الضريبي الخاص بشركة العميل وموعد سداده.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="ob-company">شركة العميل *</Label>
              <Select value={form.companyId} onValueChange={(v) => set("companyId", v)}>
                <SelectTrigger id="ob-company">
                  <SelectValue placeholder="اختر الشركة" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nameAr} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="ob-title">عنوان الالتزام *</Label>
              <Input
                id="ob-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="مثال: إقرار ضريبة القيمة المضافة لشهر مارس"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ob-type">نوع الالتزام</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger id="ob-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OBLIGATION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ob-period">الفترة *</Label>
              <Input
                id="ob-period"
                value={form.period}
                onChange={(e) => set("period", e.target.value)}
                placeholder="مثال: مارس 2026"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ob-due">تاريخ الاستحقاق *</Label>
              <Input
                id="ob-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ob-status">الحالة</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger id="ob-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBLIGATION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ob-amount">المبلغ المستحق</Label>
              <Input
                id="ob-amount"
                type="number"
                step="0.01"
                min="0"
                dir="ltr"
                className="tabular text-start"
                value={form.amountDue}
                onChange={(e) => set("amountDue", e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ob-paid">المبلغ المسدَّد</Label>
              <Input
                id="ob-paid"
                type="number"
                step="0.01"
                min="0"
                dir="ltr"
                className="tabular text-start"
                value={form.amountPaid}
                onChange={(e) => set("amountPaid", e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="ob-notes">ملاحظات</Label>
              <Textarea
                id="ob-notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ الالتزام"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
