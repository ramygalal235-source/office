"use client";

// ===== شاشة الخزائن والبنوك =====
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, Landmark, Pencil, Plus, RefreshCw, Trash2, Wallet } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { SAFE_TYPES } from "@/lib/domain";
import { BankReconDialog } from "@/components/bank-recon-dialog";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export interface BoardSafe {
  id: string;
  code: string;
  name: string;
  type: string;
  accountId: string | null;
  openingBalance: number;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  branch: string | null;
  currency: string | null;
  isActive: boolean;
  totalIn: number;
  totalOut: number;
  balance: number;
  movementCount: number;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  CASH: "خزينة نقدية",
  BANK: "حساب بنكي",
};

const EMPTY_FORM = {
  name: "",
  type: "CASH",
  accountId: "",
  openingBalance: "",
  bankName: "",
  accountNumber: "",
  iban: "",
  branch: "",
  currency: "",
};

export function SafesBoard({
  initialSafes,
  accounts,
  userRole,
}: {
  initialSafes: BoardSafe[];
  accounts: { id: string; code: string; name: string }[];
  userRole: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<BoardSafe[]>(initialSafes);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [reconSafe, setReconSafe] = useState<BoardSafe | null>(null);

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  // الأرصدة تُحدَّث من API الأرصدة، وبقية الحقول (بيانات البنك) تبقى كما هي
  const refresh = useCallback(async () => {
    const res = await apiFetch<{ id: string; code: string; name: string; type: string; openingBalance: number; totalIn: number; totalOut: number; balance: number; movementCount: number }[]>(
      "/api/safes",
      { silent: true }
    );
    if (res.ok && Array.isArray(res.data)) {
      setRows((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        const next = res.data.map((b) => {
          const existing = byId.get(b.id);
          if (existing) return { ...existing, totalIn: b.totalIn, totalOut: b.totalOut, balance: b.balance, movementCount: b.movementCount, openingBalance: b.openingBalance, name: b.name, type: b.type };
          return {
            id: b.id,
            code: b.code,
            name: b.name,
            type: b.type,
            accountId: null,
            openingBalance: b.openingBalance,
            bankName: null,
            accountNumber: null,
            iban: null,
            branch: null,
            currency: null,
            isActive: true,
            totalIn: b.totalIn,
            totalOut: b.totalOut,
            balance: b.balance,
            movementCount: b.movementCount,
            createdAt: "",
          };
        });
        return next;
      });
    }
    router.refresh();
  }, [router]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (s: BoardSafe) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      type: s.type,
      accountId: s.accountId ?? "",
      openingBalance: s.openingBalance ? String(s.openingBalance) : "",
      bankName: s.bankName ?? "",
      accountNumber: s.accountNumber ?? "",
      iban: s.iban ?? "",
      branch: s.branch ?? "",
      currency: s.currency ?? "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("اسم الموقع مطلوب");
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      type: form.type,
      accountId: form.accountId || null,
      openingBalance: form.openingBalance ? Number(form.openingBalance) : 0,
      bankName: form.bankName || null,
      accountNumber: form.accountNumber || null,
      iban: form.iban || null,
      branch: form.branch || null,
      currency: form.currency || null,
    };
    const res = editingId
      ? await apiFetch(`/api/safes/${editingId}`, { method: "PUT", body: JSON.stringify(body), silent: true })
      : await apiFetch("/api/safes", { method: "POST", body: JSON.stringify(body), silent: true });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر الحفظ");
      return;
    }
    toast.success(editingId ? "تم التحديث" : "تمت الإضافة");
    setFormOpen(false);
    await refresh();
  };

  const remove = async (s: BoardSafe) => {
    if (!window.confirm(`حذف «${s.name}»؟ حركته تبقى في قيود اليومية.`)) return;
    const res = await apiFetch(`/api/safes/${s.id}`, { method: "DELETE", silent: true });
    if (res.ok) {
      toast.success("حُذف الموقع");
      await refresh();
    } else {
      toast.error(res.error ?? "تعذّر الحذف");
    }
  };

  const totalBalance = rows.reduce((sum, s) => sum + (s.isActive ? s.balance : 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          موقع نقدي جديد
        </Button>
        <Button variant="outline" size="sm" onClick={() => refresh().catch(() => {})}>
          <RefreshCw className="size-4" />
          تحديث
        </Button>
        <div className="ms-auto flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">إجمالي النقدية والبنوك النشطة:</span>
          <span className="font-bold">{formatMoney(totalBalance)}</span>
        </div>
      </div>

      {rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Wallet className="size-8" />
            لا توجد خزائن أو حسابات بنكية بعد — أضف أول موقع نقدي
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((s) => (
          <Card key={s.id} className={!s.isActive ? "opacity-60" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                  {s.type === "BANK" ? <Landmark className="size-4.5" /> : <Wallet className="size-4.5" />}
                </div>
                <div>
                  <CardTitle className="text-sm">{s.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1.5 text-xs">
                    <span className="font-mono">{s.code}</span>
                    <Badge variant={s.type === "BANK" ? "info" : "secondary"}>{TYPE_LABELS[s.type] ?? s.type}</Badge>
                    {!s.isActive && <Badge variant="muted">معطّل</Badge>}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {s.type === "BANK" && (
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => setReconSafe(s)} title="مطابقة البنك">
                    <ArrowLeftRight className="size-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(s)} title="تعديل">
                  <Pencil className="size-4" />
                </Button>
                {userRole === "admin" && (
                  <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => remove(s)} title="حذف">
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {s.type === "BANK" && (s.bankName || s.accountNumber) && (
                <p className="mb-3 text-xs text-muted-foreground" dir="ltr">
                  {s.bankName} {s.accountNumber ?? s.iban}
                </p>
              )}
              <div className="mb-3 flex items-end justify-between">
                <span className="text-xs text-muted-foreground">الرصيد الحالي</span>
                <span className={`text-lg font-bold ${s.balance < 0 ? "text-destructive" : "text-success"}`}>{formatMoney(s.balance)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-secondary/50 p-2">
                  <div className="text-muted-foreground">افتتاحي</div>
                  <div className="mt-0.5 font-medium">{formatMoney(s.openingBalance)}</div>
                </div>
                <div className="rounded-md bg-secondary/50 p-2">
                  <div className="text-muted-foreground">وارد</div>
                  <div className="mt-0.5 font-medium text-success">{formatMoney(s.totalIn)}</div>
                </div>
                <div className="rounded-md bg-secondary/50 p-2">
                  <div className="text-muted-foreground">صادر</div>
                  <div className="mt-0.5 font-medium text-destructive">{formatMoney(s.totalOut)}</div>
                </div>
              </div>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">{s.movementCount} حركة</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "تعديل موقع نقدي" : "موقع نقدي جديد"}</DialogTitle>
            <DialogDescription>خزينة نقدية أو حساب بنكي — تُسجَّل فيه السندات وتُحسب أرصدته من الحركة.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>الاسم *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="خزينة المكتب / بنك مصر…" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>النوع</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SAFE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>حساب الدليل المرتبط</Label>
              <Select value={form.accountId || "none"} onValueChange={(v) => set("accountId", v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="اختياري…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>رصيد افتتاحي</Label>
              <Input type="number" step="0.01" value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} dir="ltr" />
            </div>
            {form.type === "BANK" && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>البنك</Label>
                  <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>رقم الحساب</Label>
                  <Input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} dir="ltr" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>IBAN</Label>
                  <Input value={form.iban} onChange={(e) => set("iban", e.target.value)} dir="ltr" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>الفرع</Label>
                  <Input value={form.branch} onChange={(e) => set("branch", e.target.value)} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving}>
              {saving ? "جارٍ الحفظ…" : editingId ? "حفظ التعديلات" : "إضافة الموقع"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reconSafe && (
        <BankReconDialog
          safeId={reconSafe.id}
          safeName={reconSafe.name}
          open={!!reconSafe}
          onOpenChange={(v) => {
            if (!v) setReconSafe(null);
          }}
        />
      )}
    </div>
  );
}
