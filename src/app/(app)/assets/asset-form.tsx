"use client";

// ===== نموذج إنشاء أصل ثابت =====
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AssetForm({
  trigger,
  accounts,
}: {
  trigger: React.ReactNode;
  accounts: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "",
    cost: "",
    salvageValue: "",
    lifeYears: "5",
    method: "STRAIGHT_LINE",
    acquisitionDate: new Date().toISOString().slice(0, 10),
    accountId: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name || !Number(form.cost)) {
      toast.error("اسم الأصل والتكلفة مطلوبتان");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/assets", {
      method: "POST",
      ...jsonBody({
        name: form.name,
        category: form.category || undefined,
        cost: Number(form.cost),
        salvageValue: Number(form.salvageValue || 0),
        lifeYears: Number(form.lifeYears),
        method: form.method,
        acquisitionDate: form.acquisitionDate,
        accountId: form.accountId || null,
      }),
      successMessage: "تم إنشاء الأصل",
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      setForm({ ...form, name: "", cost: "", salvageValue: "", accountId: "" });
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>أصل ثابت جديد</DialogTitle>
          <DialogDescription>
            التكلفة والقيمة المتبقية بالجنيه — طريقة الإهلاك: قسط ثابت (متساوي) أو تنقص (على القيمة الدفترية).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>اسم الأصل *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثال: سيارة نقل — ط 2023" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>التكلفة (ج.م) *</Label>
            <Input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>القيمة المتبقية (ج.م)</Label>
            <Input type="number" min="0" step="0.01" value={form.salvageValue} onChange={(e) => set("salvageValue", e.target.value)} dir="ltr" placeholder="0" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>العمر الافتراضي (سنوات)</Label>
            <Input type="number" min="0.5" step="0.5" value={form.lifeYears} onChange={(e) => set("lifeYears", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>طريقة الإهلاك</Label>
            <Select value={form.method} onValueChange={(v) => set("method", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="STRAIGHT_LINE">قسط ثابت</SelectItem>
                <SelectItem value="DECLINING">تنقص</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>تاريخ الاستحواذ</Label>
            <Input type="date" value={form.acquisitionDate} onChange={(e) => set("acquisitionDate", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>الحساب (أصول ثابتة)</Label>
            <Select value={form.accountId || undefined} onValueChange={(v) => set("accountId", v)}>
              <SelectTrigger><SelectValue placeholder="اختياري" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>ملاحظة</Label>
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="صنف/ملاحظة" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الأصل"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
