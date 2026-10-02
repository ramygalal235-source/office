"use client";

// ===== شاشة العملاء والموردين =====
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Search, Trash2, UserRound, Users } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { PARTY_TYPES } from "@/lib/domain";
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

export interface BoardParty {
  id: string;
  code: string;
  name: string;
  type: string;
  legalName: string | null;
  taxNumber: string | null;
  commercialReg: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  openingBalance: number;
  balanceSide: string;
  creditLimit: number | null;
  notes: string | null;
  isActive: boolean;
  balance: number;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  CUSTOMER: "عميل",
  SUPPLIER: "مورد",
};

// الرصيد الإيجابي: العميل مدين لنا، والمورد نحن مدينون له
function balanceLabel(p: { type: string; balance: number }): { text: string; className: string } {
  const v = formatMoney(p.balance);
  if (Math.abs(p.balance) < 0.005) return { text: "لا رصيد", className: "text-muted-foreground" };
  if (p.type === "CUSTOMER") return { text: `${v} مدين لنا`, className: "font-medium text-info" };
  return { text: `${v} مدينون له`, className: "font-medium text-warning" };
}

const EMPTY_FORM = {
  name: "",
  type: "CUSTOMER",
  legalName: "",
  taxNumber: "",
  commercialReg: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  openingBalance: "",
  balanceSide: "DEBIT",
  creditLimit: "",
  notes: "",
};

export function PartiesBoard({ initialParties, userRole }: { initialParties: BoardParty[]; userRole: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<BoardParty[]>(initialParties);
  const [fType, setFType] = useState("");
  const [q, setQ] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const filtered = rows.filter(
    (p) =>
      (!fType || p.type === fType) &&
      (!q || p.name.includes(q) || (p.taxNumber ?? "").includes(q) || p.code.includes(q))
  );

  const refresh = useCallback(async () => {
    const [res, custBal, suppBal] = await Promise.all([
      apiFetch<Record<string, unknown>[]>("/api/parties?take=500", { silent: true }),
      apiFetch<{ partyId: string; balance: number }[]>("/api/parties/balances?type=CUSTOMER", { silent: true }),
      apiFetch<{ partyId: string; balance: number }[]>("/api/parties/balances?type=SUPPLIER", { silent: true }),
    ]);
    if (res.ok && Array.isArray(res.data)) {
      const balanceBy = new Map<string, number>([
        ...(custBal.ok && Array.isArray(custBal.data) ? custBal.data.map((b): [string, number] => [b.partyId, b.balance]) : []),
        ...(suppBal.ok && Array.isArray(suppBal.data) ? suppBal.data.map((b): [string, number] => [b.partyId, b.balance]) : []),
      ]);
      setRows(
        res.data.map((p) => ({
          id: p.id as string,
          code: p.code as string,
          name: p.name as string,
          type: p.type as string,
          legalName: (p.legalName as string | null) ?? null,
          taxNumber: (p.taxNumber as string | null) ?? null,
          commercialReg: (p.commercialReg as string | null) ?? null,
          phone: (p.phone as string | null) ?? null,
          email: (p.email as string | null) ?? null,
          address: (p.address as string | null) ?? null,
          city: (p.city as string | null) ?? null,
          openingBalance: (p.openingBalance as number) ?? 0,
          balanceSide: (p.balanceSide as string) ?? "DEBIT",
          creditLimit: (p.creditLimit as number | null) ?? null,
          notes: (p.notes as string | null) ?? null,
          isActive: Boolean(p.isActive),
          balance: balanceBy.get(p.id as string) ?? ((p.openingBalance as number) ?? 0),
          createdAt: (p.createdAt as string) ?? "",
        }))
      );
    }
    router.refresh();
  }, [router]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (p: BoardParty) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      type: p.type,
      legalName: p.legalName ?? "",
      taxNumber: p.taxNumber ?? "",
      commercialReg: p.commercialReg ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      address: p.address ?? "",
      city: p.city ?? "",
      openingBalance: p.openingBalance ? String(p.openingBalance) : "",
      balanceSide: p.balanceSide,
      creditLimit: p.creditLimit != null ? String(p.creditLimit) : "",
      notes: p.notes ?? "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("اسم الطرف مطلوب");
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      type: form.type,
      legalName: form.legalName || null,
      taxNumber: form.taxNumber || null,
      commercialReg: form.commercialReg || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      city: form.city || null,
      openingBalance: form.openingBalance ? Number(form.openingBalance) : 0,
      balanceSide: form.balanceSide,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
      notes: form.notes || null,
    };
    const res = editingId
      ? await apiFetch(`/api/parties/${editingId}`, { method: "PUT", body: JSON.stringify(body), silent: true })
      : await apiFetch("/api/parties", { method: "POST", body: JSON.stringify(body), silent: true });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر الحفظ");
      return;
    }
    toast.success(editingId ? "تم التحديث" : "تمت الإضافة");
    setFormOpen(false);
    await refresh();
  };

  const toggleActive = async (p: BoardParty) => {
    const res = await apiFetch(`/api/parties/${p.id}`, { method: "PUT", body: JSON.stringify({ isActive: !p.isActive }), silent: true });
    if (res.ok) {
      toast.success(p.isActive ? "عُطّل الطرف" : "فُعّل الطرف");
      await refresh();
    } else {
      toast.error(res.error ?? "تعذّر التعديل");
    }
  };

  const remove = async (p: BoardParty) => {
    if (!window.confirm(`حذف «${p.name}»؟ حذفه يفكّه عن مستنداته (تبقى الأرقام في القيود).`)) return;
    const res = await apiFetch(`/api/parties/${p.id}`, { method: "DELETE", silent: true });
    if (res.ok) {
      toast.success("حُذف الطرف");
      await refresh();
    } else {
      toast.error(res.error ?? "تعذّر الحذف");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          إضافة طرف
        </Button>
        <Input placeholder="بحث بالاسم أو الرقم الضريبي…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        <Select value={fType || "all"} onValueChange={(v) => setFType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {PARTY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refresh().catch(() => {})}>
          <Search className="size-4" />
          تحديث
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-xs text-muted-foreground">
                <th className="p-3 text-start font-medium">الطرف</th>
                <th className="p-3 text-start font-medium">النوع</th>
                <th className="p-3 text-start font-medium">الرقم الضريبي</th>
                <th className="p-3 text-start font-medium">الهاتف</th>
                <th className="p-3 text-start font-medium">الرصيد</th>
                <th className="p-3 text-start font-medium">الحالة</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <Users className="size-8" />
                    لا توجد أطراف مطابقة
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const bl = balanceLabel(p);
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-accent/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                      </div>
                      {p.city && <div className="text-xs text-muted-foreground">{p.city}</div>}
                    </td>
                    <td className="p-3">
                      <Badge variant={p.type === "CUSTOMER" ? "info" : "warning"}>{TYPE_LABELS[p.type] ?? p.type}</Badge>
                    </td>
                    <td className="p-3 text-xs" dir="ltr">
                      {p.taxNumber ?? "—"}
                    </td>
                    <td className="p-3 text-xs" dir="ltr">
                      {p.phone ?? "—"}
                    </td>
                    <td className={`p-3 text-xs ${bl.className}`}>{bl.text}</td>
                    <td className="p-3">
                      <Badge variant={p.isActive ? "success" : "muted"}>{p.isActive ? "نشط" : "معطّل"}</Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => window.open(`/print/party-statement/${p.id}`, "_blank")}
                          title="كشف حساب (طباعة/PDF)"
                        >
                          <FileText className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="تعديل">
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => toggleActive(p)} title={p.isActive ? "تعطيل" : "تفعيل"}>
                          <UserRound className="size-4" />
                        </Button>
                        {userRole === "admin" && (
                          <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(p)} title="حذف">
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل طرف" : "إضافة طرف"}</DialogTitle>
            <DialogDescription>
              الطرف يربط بين الفواتير والسندات — رصيده يُحسب تلقائيًا من حركة المستندات.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>الاسم *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>النوع</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>الاسم القانوني</Label>
              <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>الرقم الضريبي</Label>
              <Input value={form.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>السجل التجاري</Label>
              <Input value={form.commercialReg} onChange={(e) => set("commercialReg", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>الهاتف</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input value={form.email} onChange={(e) => set("email", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>المدينة</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>العنوان</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>رصيد افتتاحي</Label>
              <Input type="number" step="0.01" value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>جهة الرصيد الافتتاحي</Label>
              <Select value={form.balanceSide} onValueChange={(v) => set("balanceSide", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBIT">مدين</SelectItem>
                  <SelectItem value="CREDIT">دائن</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>حد الائتمان (اختياري)</Label>
              <Input type="number" step="0.01" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving}>
              {saving ? "جارٍ الحفظ…" : editingId ? "حفظ التعديلات" : "إضافة الطرف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
