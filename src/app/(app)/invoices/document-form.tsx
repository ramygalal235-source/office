"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { lineTotal, round2, sumMoney, toISODate } from "@/lib/money";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PartyOption = { id: string; name: string };
export type AccountOption = { id: string; code: string; name: string };
export type ProductOption = {
  id: string;
  code: string;
  name: string;
  salePrice: number;
  costPrice: number;
  unit: string;
};

interface Line {
  key: number;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  accountId: string;
}

let lineKey = 0;
const newLine = (): Line => ({
  key: ++lineKey,
  productId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
  discount: "0",
  taxRate: "14",
  accountId: "",
});

export function DocumentForm({
  kind,
  customers,
  suppliers,
  accounts,
  products,
  trigger,
  defaultVatRate = 14,
}: {
  kind: "invoice" | "purchase";
  customers: PartyOption[];
  suppliers: PartyOption[];
  accounts: AccountOption[];
  products: ProductOption[];
  trigger: React.ReactNode;
  defaultVatRate?: number;
}) {
  const router = useRouter();
  const isPurchase = kind === "purchase";
  const parties = isPurchase ? suppliers : customers;
  const endpoint = isPurchase ? "/api/purchases" : "/api/invoices";

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { ...newLine(), taxRate: String(defaultVatRate) },
  ]);

  // الحسابات القابلة للاختيار: إيرادات لفاتورة البيع، مصروفات والمشتريات للشراء
  const accountOptions = useMemo(() => {
    const allowed = isPurchase
      ? ["EXPENSE", "ASSET"]
      : ["INCOME"];
    return accounts.filter((a) => allowed.includes(a.type) && !a.code.endsWith("99"));
  }, [accounts, isPurchase]);

  const computed = useMemo(
    () =>
      lines.map((l) => {
        const t = lineTotal({
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          discount: Number(l.discount) || 0,
          taxRate: Number(l.taxRate) || 0,
        });
        return { ...l, ...t };
      }),
    [lines]
  );

  const subtotal = sumMoney(computed.map((l) => l.quantity * l.unitPrice));
  const globalDiscount = round2(Number(discount) || 0);
  const net = round2(subtotal - globalDiscount);
  const tax = sumMoney(computed.map((l) => l.tax));
  const total = round2(net + tax);

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickProduct(key: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    updateLine(key, {
      productId,
      description: p?.name ?? "",
      unitPrice: p ? String(isPurchase ? p.costPrice : p.salePrice) : "",
    });
  }

  function removeLine(key: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));
  }

  async function submit(postAfter: boolean) {
    if (saving || posting) return;

    const valid = lines.filter((l) => l.description.trim() && Number(l.unitPrice) > 0);
    if (!valid.length) {
      // نعرض الرسالة من واجهة المستخدم بدل نداء الخادم
      import("sonner").then(({ toast }) => toast.error("أضف سطرًا بوصف ومبلغ"));
      return;
    }

    const payload = {
      ...(isPurchase ? { supplierId: partyId } : { customerId: partyId }),
      companyId: "",
      date,
      dueDate,
      discount: globalDiscount,
      notes,
      status: isPurchase ? "RECEIVED" : "ISSUED",
      items: valid.map((l) => ({
        productId: l.productId || "",
        description: l.description,
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        discount: Number(l.discount) || 0,
        taxRate: Number(l.taxRate) || 0,
        accountId: l.accountId || "",
      })),
    };

    setSaving(true);
    const res = await apiFetch<{ id: string }>(endpoint, {
      method: "POST",
      ...jsonBody(payload),
    });
    setSaving(false);
    if (!res.ok || !res.data) return;

    if (postAfter) {
      setPosting(true);
      const postRes = await apiFetch(`${endpoint}/${res.data.id}/post`, {
        method: "POST",
        successMessage: isPurchase ? "تم حفظ الفاتورة وترحيلها" : "تم حفظ الفاتورة وترحيلها",
      });
      setPosting(false);
      if (!postRes.ok) {
        router.refresh();
        return;
      }
    } else {
      const { toast } = await import("sonner");
      toast.success("تم حفظ الفاتورة كمسودة");
    }

    setOpen(false);
    setLines([{ ...newLine(), taxRate: String(defaultVatRate) }]);
    setPartyId("");
    setNotes("");
    setDiscount("0");
    router.refresh();
  }

  const busy = saving || posting;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isPurchase ? "فاتورة شراء جديدة" : "فاتورة بيع جديدة"}</DialogTitle>
          <DialogDescription>
            {isPurchase
              ? "ستُرحَّل عند الحفظ إلى قيد: مدين المخزون/التكلفة، دائن الموردين."
              : "ستُرحَّل عند الحفظ إلى قيد: مدين العملاء، دائن الإيرادات وضريبة القيمة المضافة."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* ترويسة المستند */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="doc-party">{isPurchase ? "المورد" : "العميل"}</Label>
              <Select value={partyId} onValueChange={setPartyId}>
                <SelectTrigger id="doc-party">
                  <SelectValue placeholder="اختر الطرف" />
                </SelectTrigger>
                <SelectContent>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-date">التاريخ</Label>
              <Input id="doc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="doc-due">تاريخ الاستحقاق</Label>
              <Input
                id="doc-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* السطور */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">الصنف</TableHead>
                  <TableHead>الوصف</TableHead>
                  <TableHead className="w-24 text-center">الكمية</TableHead>
                  <TableHead className="w-32 text-center">السعر</TableHead>
                  <TableHead className="w-24 text-center">خصم</TableHead>
                  <TableHead className="w-24 text-center">ضريبة %</TableHead>
                  <TableHead className="w-32 text-start">الإجمالي</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {computed.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell>
                      <Select value={l.productId} onValueChange={(v) => pickProduct(l.key, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="اختياري" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-xs"
                        value={l.description}
                        onChange={(e) => updateLine(l.key, { description: e.target.value })}
                        placeholder="وصف السطر"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="tabular h-8 text-center text-xs"
                        dir="ltr"
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, { quantity: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="tabular h-8 text-center text-xs"
                        dir="ltr"
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.unitPrice}
                        onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="tabular h-8 text-center text-xs"
                        dir="ltr"
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.discount}
                        onChange={(e) => updateLine(l.key, { discount: e.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="tabular h-8 text-center text-xs"
                        dir="ltr"
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.taxRate}
                        onChange={(e) => updateLine(l.key, { taxRate: e.target.value })}
                      />
                    </TableCell>
                    <TableCell className="tabular text-start font-medium">
                      {l.total.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => removeLine(l.key)}
                        disabled={lines.length === 1}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setLines((ls) => [...ls, newLine()])}
          >
            <Plus /> إضافة سطر
          </Button>

          {/* الإجماليات */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex w-64 flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">الإجمالي قبل الخصم</span>
                <span className="tabular font-medium">{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <Label htmlFor="doc-discount" className="text-muted-foreground">
                  خصم عام
                </Label>
                <Input
                  id="doc-discount"
                  dir="ltr"
                  type="number"
                  step="0.01"
                  min="0"
                  className="tabular h-7 w-28 text-center text-xs"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">الصافي</span>
                <span className="tabular font-medium">{net.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ضريبة القيمة المضافة</span>
                <span className="tabular font-medium">{tax.toFixed(2)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1 text-base font-bold">
                <span>الإجمالي</span>
                <span className="tabular">{total.toFixed(2)} ج.م</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="doc-notes">ملاحظات</Label>
            <Textarea id="doc-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            إلغاء
          </Button>
          <Button type="button" variant="secondary" onClick={() => submit(false)} disabled={busy}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            حفظ كمسودة
          </Button>
          <Button type="button" onClick={() => submit(true)} disabled={busy}>
            {posting ? <Loader2 className="animate-spin" /> : null}
            حفظ وترحيل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
