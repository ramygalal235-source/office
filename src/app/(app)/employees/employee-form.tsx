"use client";

// ===== نموذج إنشاء/تعديل موظف =====
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

export type EmployeeSeed = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  nationalId: string | null;
  phone: string | null;
  email: string | null;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  insuranceNumber: string | null;
};

const EMPTY = {
  name: "",
  jobTitle: "",
  department: "",
  nationalId: "",
  phone: "",
  email: "",
  basicSalary: "",
  housingAllowance: "",
  transportAllowance: "",
  otherAllowance: "",
  insuranceNumber: "",
};

export function EmployeeForm({
  trigger,
  employee,
  open: controlledOpen,
  onOpenChange: controlledSetOpen,
}: {
  trigger?: React.ReactNode;
  employee?: EmployeeSeed;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledSetOpen ?? setInternalOpen;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    ...EMPTY,
    name: employee?.name ?? "",
    jobTitle: employee?.jobTitle ?? "",
    department: employee?.department ?? "",
    nationalId: employee?.nationalId ?? "",
    phone: employee?.phone ?? "",
    email: employee?.email ?? "",
    basicSalary: employee ? String(employee.basicSalary) : "",
    housingAllowance: employee ? String(employee.housingAllowance) : "",
    transportAllowance: employee ? String(employee.transportAllowance) : "",
    otherAllowance: employee ? String(employee.otherAllowance) : "",
    insuranceNumber: employee?.insuranceNumber ?? "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name) {
      toast.error("اسم الموظف مطلوب");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      jobTitle: form.jobTitle || undefined,
      department: form.department || undefined,
      nationalId: form.nationalId || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      basicSalary: Number(form.basicSalary || 0),
      housingAllowance: Number(form.housingAllowance || 0),
      transportAllowance: Number(form.transportAllowance || 0),
      otherAllowance: Number(form.otherAllowance || 0),
      insuranceNumber: form.insuranceNumber || undefined,
    };
    const res = await apiFetch(employee ? `/api/employees/${employee.id}` : "/api/employees", {
      method: employee ? "PUT" : "POST",
      ...jsonBody(payload),
      successMessage: employee ? "تم تحديث الموظف" : "تم إنشاء الموظف",
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{employee ? `تعديل: ${employee.name}` : "موظف جديد"}</DialogTitle>
          <DialogDescription>
            الراتب الأساسي والمستحقات تُستخدم في شغل الرواتب — يمكن تعديلها في أي وقت (تؤثر على الشغل الجديد فقط).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>الاسم *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>الوظيفة</Label>
            <Input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="محاسب، سائق…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>القسم</Label>
            <Input value={form.department} onChange={(e) => set("department", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>الرقم القومي</Label>
            <Input value={form.nationalId} onChange={(e) => set("nationalId", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>الهاتف</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>البريد</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>الراتب الأساسي (ج.م)</Label>
            <Input type="number" min="0" step="0.01" value={form.basicSalary} onChange={(e) => set("basicSalary", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>مستحق سكن (ج.م)</Label>
            <Input type="number" min="0" step="0.01" value={form.housingAllowance} onChange={(e) => set("housingAllowance", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>مستحق مواصلات (ج.م)</Label>
            <Input type="number" min="0" step="0.01" value={form.transportAllowance} onChange={(e) => set("transportAllowance", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>مستحق آخر (ج.م)</Label>
            <Input type="number" min="0" step="0.01" value={form.otherAllowance} onChange={(e) => set("otherAllowance", e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>رقم التأمينات</Label>
            <Input value={form.insuranceNumber} onChange={(e) => set("insuranceNumber", e.target.value)} dir="ltr" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
