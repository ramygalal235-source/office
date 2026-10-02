"use client";

// ===== شاشة المنتجات والمخزون =====
// الرصيد هنا ليس رقمًا يدويًا: ترحيل الفاتورة ينقصه وترحيل الشراء يزيده،
// وكل حركة مسجلة. ما يبقى يدويًا هو تسوية الجرد — وهي تسوية مسجلة أيضًا.
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
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

export interface BoardProduct {
  id: string;
  code: string;
  name: string;
  category: string | null;
  unit: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  minStock: number;
  isActive: boolean;
  notes: string | null;
  lowStock: boolean;
  createdAt: string;
}

const EMPTY_FORM = {
  name: "",
  category: "",
  unit: "قطعة",
  quantity: "",
  costPrice: "",
  salePrice: "",
  minStock: "",
  notes: "",
};

export function ProductsBoard({
  initialProducts,
  userRole,
}: {
  initialProducts: BoardProduct[];
  userRole: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<BoardProduct[]>(initialProducts);
  const [q, setQ] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [adjustName, setAdjustName] = useState("");
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const filtered = useMemo(
    () =>
      rows.filter(
        (p) =>
          (!onlyLow || p.lowStock) &&
          (!q || p.name.includes(q) || p.code.includes(q) || (p.category ?? "").includes(q))
      ),
    [rows, q, onlyLow]
  );

  const liveTotals = useMemo(() => {
    const value = rows.reduce((s, p) => s + p.quantity * p.costPrice, 0);
    const low = rows.filter((p) => p.lowStock).length;
    return { value, low };
  }, [rows]);

  const refresh = useCallback(async () => {
    const res = await apiFetch<Record<string, unknown>[]>("/api/products?take=1000", { silent: true });
    if (res.ok && Array.isArray(res.data)) {
      setRows(
        res.data.map((p) => ({
          id: p.id as string,
          code: p.code as string,
          name: p.name as string,
          category: (p.category as string | null) ?? null,
          unit: (p.unit as string) ?? "قطعة",
          quantity: (p.quantity as number) ?? 0,
          costPrice: (p.costPrice as number) ?? 0,
          salePrice: (p.salePrice as number) ?? 0,
          minStock: (p.minStock as number) ?? 0,
          isActive: Boolean(p.isActive),
          notes: (p.notes as string | null) ?? null,
          lowStock: Boolean(p.isActive) && ((p.quantity as number) ?? 0) <= ((p.minStock as number) ?? 0),
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

  const openEdit = (p: BoardProduct) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category ?? "",
      unit: p.unit,
      quantity: p.quantity ? String(p.quantity) : "",
      costPrice: p.costPrice ? String(p.costPrice) : "",
      salePrice: p.salePrice ? String(p.salePrice) : "",
      minStock: p.minStock ? String(p.minStock) : "",
      notes: p.notes ?? "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("اسم المنتج مطلوب");
      return;
    }
    setSaving(true);
    const body: {
      name: string;
      category: string | null;
      unit: string;
      costPrice: number;
      salePrice: number;
      minStock: number;
      notes: string | null;
      quantity?: number;
    } = {
      name: form.name.trim(),
      category: form.category || null,
      unit: form.unit || "قطعة",
      costPrice: form.costPrice ? Number(form.costPrice) : 0,
      salePrice: form.salePrice ? Number(form.salePrice) : 0,
      minStock: form.minStock ? Number(form.minStock) : 0,
      notes: form.notes || null,
    };
    if (!editingId) body.quantity = form.quantity ? Number(form.quantity) : 0;
    const res = editingId
      ? await apiFetch(`/api/products/${editingId}`, { method: "PUT", body: JSON.stringify(body), silent: true })
      : await apiFetch("/api/products", { method: "POST", body: JSON.stringify(body), silent: true });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر الحفظ");
      return;
    }
    toast.success(editingId ? "تم التحديث" : "تمت الإضافة");
    setFormOpen(false);
    await refresh();
  };

  const openAdjust = (p: BoardProduct) => {
    setAdjustId(p.id);
    setAdjustName(p.name);
    setAdjustQty(String(p.quantity));
    setAdjustDelta("");
    setAdjustNotes("");
  };

  const saveAdjust = async () => {
    if (!adjustId) return;
    const delta = Number(adjustDelta);
    if (!adjustDelta || Number.isNaN(delta) || delta === 0) {
      toast.error("أدخل فرق الجرد (+ أو −)");
      return;
    }
    setAdjusting(true);
    const res = await apiFetch(`/api/products/${adjustId}/adjust`, {
      method: "POST",
      body: JSON.stringify({ delta, notes: adjustNotes || undefined }),
      silent: true,
    });
    setAdjusting(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر التسوية");
      return;
    }
    toast.success("سُجّلت تسوية الجرد كحركة ADJUST");
    setAdjustId(null);
    await refresh();
  };

  const toggleActive = async (p: BoardProduct) => {
    const res = await apiFetch(`/api/products/${p.id}`, { method: "PUT", body: JSON.stringify({ isActive: !p.isActive }), silent: true });
    if (res.ok) {
      toast.success(p.isActive ? "عُطّل المنتج" : "فُعّل المنتج");
      await refresh();
    } else {
      toast.error(res.error ?? "تعذّر التعديل");
    }
  };

  const remove = async (p: BoardProduct) => {
    if (!window.confirm(`حذف «${p.name}» نهائيًا؟`)) return;
    const res = await apiFetch(`/api/products/${p.id}`, { method: "DELETE", silent: true });
    if (res.ok) {
      toast.success("حُذف المنتج");
      await refresh();
    } else {
      toast.error(res.error ?? "تعذّر الحذف");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ملخص */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
              <Package className="size-4.5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">قيمة المخزون (بتكلفة)</p>
              <p className="text-lg font-bold">{formatMoney(liveTotals.value)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-warning/15">
              <Scale className="size-4.5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">أصناف تحت حد الطلب</p>
              <p className={`text-lg font-bold ${liveTotals.low > 0 ? "text-warning" : ""}`}>{liveTotals.low}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
              <Package className="size-4.5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الأصناف</p>
              <p className="text-lg font-bold">{rows.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          منتج جديد
        </Button>
        <Input placeholder="بحث بالاسم أو الكود…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        <Button variant={onlyLow ? "default" : "outline"} size="sm" onClick={() => setOnlyLow((v) => !v)}>
          <Scale className="size-4" />
          تحت الحد فقط
        </Button>
        <Button variant="outline" size="sm" onClick={() => refresh().catch(() => {})}>
          تحديث
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="p-3 text-start font-medium">المنتج</th>
                <th className="p-3 text-start font-medium">التصنيف</th>
                <th className="p-3 text-start font-medium">الرصيد</th>
                <th className="p-3 text-start font-medium">حد الطلب</th>
                <th className="p-3 text-start font-medium">التكلفة</th>
                <th className="p-3 text-start font-medium">سعر البيع</th>
                <th className="p-3 text-start font-medium">الحالة</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                    <Package className="size-8" />
                    لا توجد منتجات مطابقة
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className={`border-b last:border-0 hover:bg-accent/30 ${!p.isActive ? "opacity-60" : ""}`}>
                  <td className="p-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{p.code}</div>
                  </td>
                  <td className="p-3 text-xs">{p.category ?? "—"}</td>
                  <td className="p-3">
                    <span className={`font-medium ${p.lowStock ? "text-warning" : ""}`}>
                      {p.quantity} {p.unit}
                    </span>
                    {p.lowStock && (
                      <Badge variant="warning" className="ms-2">
                        تحت الحد
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 text-xs">{p.minStock}</td>
                  <td className="p-3 text-xs" dir="ltr">
                    {formatMoney(p.costPrice)}
                  </td>
                  <td className="p-3 text-xs" dir="ltr">
                    {formatMoney(p.salePrice)}
                  </td>
                  <td className="p-3">
                    <Badge variant={p.isActive ? "success" : "muted"}>{p.isActive ? "نشط" : "معطّل"}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => openAdjust(p)}>
                        تسوية
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title="تعديل">
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => toggleActive(p)} title={p.isActive ? "تعطيل" : "تفعيل"}>
                        {p.isActive ? "×" : "✓"}
                      </Button>
                      {userRole === "admin" && (
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

      {/* إنشاء / تعديل */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل منتج" : "منتج جديد"}</DialogTitle>
            <DialogDescription>
              الرصيد الأولي فقط يُدخل يدويًا — ما بعده يتبع الترحيل آليًا.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>الاسم *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>التصنيف</Label>
              <Input value={form.category} onChange={(e) => set("category", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>وحدة القياس</Label>
              <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} />
            </div>
            {!editingId && (
              <div className="flex flex-col gap-1.5">
                <Label>رصيد أولي</Label>
                <Input type="number" step="0.01" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} dir="ltr" />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>سعر التكلفة</Label>
              <Input type="number" step="0.01" value={form.costPrice} onChange={(e) => set("costPrice", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>سعر البيع</Label>
              <Input type="number" step="0.01" value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>حد الطلب (تنبيه تحت هذا الرصيد)</Label>
              <Input type="number" step="0.01" value={form.minStock} onChange={(e) => set("minStock", e.target.value)} dir="ltr" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>ملاحظات</Label>
              <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving}>
              {saving ? "جارٍ الحفظ…" : editingId ? "حفظ التعديلات" : "إضافة المنتج"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تسوية جرد */}
      <Dialog open={adjustId !== null} onOpenChange={(o) => !o && setAdjustId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تسوية جرد — {adjustName}</DialogTitle>
            <DialogDescription>
              الرصيد الحالي {adjustQty}. التسوية تُسجَّل كحركة ADJUST باسم من سُوِّى.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>الفرق (+ زيادة / − نقصان)</Label>
              <Input type="number" step="0.01" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)} dir="ltr" placeholder="مثال: -2.5" />
            </div>
            {adjustDelta && Number(adjustDelta) !== 0 && (
              <p className="text-xs text-muted-foreground">
                الرصيد بعد التسوية: {roundNum(Number(adjustQty || 0) + Number(adjustDelta))}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>سبب التسوية</Label>
              <Input value={adjustNotes} onChange={(e) => setAdjustNotes(e.target.value)} placeholder="جرد دوري، تالف، خطأ سابقة…" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveAdjust} disabled={adjusting}>
              {adjusting ? "جارٍ التسجيل…" : "تسجيل التسوية"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function roundNum(n: number): number {
  return Math.round(n * 100) / 100;
}
