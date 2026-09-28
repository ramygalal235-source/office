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
import { entityTypeLabel, legalFormLabel } from "@/components/status-badge";

const ENTITY_TYPES = [
  "COMPANY", "INDIVIDUAL", "PARTNERSHIP", "LLC", "SAE", "NONPROFIT", "BRANCH",
];
const LEGAL_FORMS = ["INDIVIDUAL", "SOLIDARITY", "SIMPLE_PARTNERSHIP", "LLC", "SAE", "NONPROFIT"];

const EMPTY = {
  nameAr: "",
  nameEn: "",
  entityType: "COMPANY",
  legalForm: "LLC",
  activity: "",
  taxNumber: "",
  taxFileNumber: "",
  taxOffice: "",
  vatRegistrationNumber: "",
  vatOffice: "",
  commercialRegNumber: "",
  socialInsuranceNumber: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  ownerName: "",
  ownerNationalId: "",
  contactPerson: "",
  contactPhone: "",
  notes: "",
};

export function CompanyForm({ trigger }: { trigger?: React.ReactNode }) {
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
    const res = await apiFetch("/api/companies", {
      method: "POST",
      ...jsonBody(form),
      successMessage: "تمت إضافة شركة العميل",
    });
    setSaving(false);
    if (res.ok) {
      setForm(EMPTY);
      setOpen(false);
      router.refresh();
    }
  }

  const field = (
    key: keyof typeof EMPTY,
    label: string,
    placeholder = "",
    type = "text"
  ) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`co-${key}`}>{label}</Label>
      <Input
        id={`co-${key}`}
        type={type}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> شركة جديدة
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>إضافة شركة عميل</DialogTitle>
          <DialogDescription>
            الملف الضريبي الكامل للشركة — يظهر في تقارير الالتزامات.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-5">
          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-muted-foreground">البيانات الأساسية</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("nameAr", "اسم الشركة بالعربية *", "مثال: شركة النور للتجارة")}
              {field("nameEn", "الاسم بالإنجليزية", "Al-Nour Trading")}
              <div className="flex flex-col gap-2">
                <Label htmlFor="co-entityType">نوع الكيان</Label>
                <Select value={form.entityType} onValueChange={(v) => set("entityType", v)}>
                  <SelectTrigger id="co-entityType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {entityTypeLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="co-legalForm">الصفة القانونية</Label>
                <Select value={form.legalForm} onValueChange={(v) => set("legalForm", v)}>
                  <SelectTrigger id="co-legalForm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_FORMS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {legalFormLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {field("activity", "نشاط العمل")}
              {field("phone", "الهاتف")}
              {field("email", "البريد الإلكتروني", "name@example.com", "email")}
              {field("city", "المدينة")}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="co-address">العنوان</Label>
                <Input
                  id="co-address"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-muted-foreground">الملف الضريبي</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("taxNumber", "الرقم الضريبي")}
              {field("taxFileNumber", "رقم ملف ضرائب")}
              {field("taxOffice", "مصلحة الضرائب")}
              {field("vatRegistrationNumber", "رقم التسجيل بالقيمة المضافة")}
              {field("vatOffice", "مصلحة القيمة المضافة")}
              {field("commercialRegNumber", "السجل التجاري")}
              {field("socialInsuranceNumber", "رقم التأمينات")}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-muted-foreground">المالك وجهة الاتصال</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("ownerName", "اسم المالك")}
              {field("ownerNationalId", "الرقم القومي")}
              {field("contactPerson", "الشخص المسؤول")}
              {field("contactPhone", "هاتف المسؤول")}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Label htmlFor="co-notes">ملاحظات</Label>
            <Textarea
              id="co-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ الشركة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
