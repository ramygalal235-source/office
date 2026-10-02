"use client";

// ===== إنشاء موازنة: سنة + نوع + أسطر (حساب × مبلغ × شهري/سنوي) =====
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Line = { accountId: string; amount: string; periodMonth: string };

export function BudgetForm({
  trigger,
  accounts,
}: {
  trigger: React.ReactNode;
  accounts: { id: string; label: string; type: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));
  const [type, setType] = useState("EXPENSE");
  const [lines, setLines] = useState<Line[]>([{ accountId: "", amount: "", periodMonth: "" }]);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    const validLines = lines.filter((l) => l.accountId && Number(l.amount));
    if (validLines.length === 0) {
      toast.error("أضف سطرًا واحدًا على الأقل بحساب ومبلغ");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/budgets", {
      method: "POST",
      ...jsonBody({
        fiscalYear: Number(fiscalYear),
        type,
        lines: validLines.map((l) => ({
          accountId: l.accountId,
          amount: Number(l.amount),
          periodMonth: l.periodMonth ? Number(l.periodMonth) : null,
        })),
      }),
      successMessage: "تم إنشاء الموازنة",
    });
    setSaving(false);
    if (res.ok) {
      setOpen(false);
      setLines([{ accountId: "", amount: "", periodMonth: "" }]);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>موازنة جديدة</DialogTitle>
          <DialogDescription>
            سطر واحد للحساب — المبلغ سنوي أو شهري محدد. الفعلي يُحدَّث يدويًا من شاشة الموازنات.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>السنة المالية</Label>
            <Input type="number" min="2000" max="2100" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>النوع</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EXPENSE">مصروفات</SelectItem>
                <SelectItem value="REVENUE">إيرادات</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_120px_110px_32px] gap-2 text-xs font-semibold text-muted-foreground">
            <span>الحساب</span>
            <span>المبلغ (ج.م)</span>
            <span>الفترة</span>
            <span />
          </div>
          {lines.map((l, i) => {
            const candidates = accounts.filter((a) => a.type === (type === "EXPENSE" ? "EXPENSE" : "INCOME"));
            return (
              <div key={i} className="grid grid-cols-[1fr_120px_110px_32px] items-center gap-2">
                <Select value={l.accountId || undefined} onValueChange={(v) => setLine(i, { accountId: v })}>
                  <SelectTrigger><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
                  <SelectContent>
                    {candidates.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min="0" step="0.01" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} dir="ltr" />
                <Select value={l.periodMonth || "annual"} onValueChange={(v) => setLine(i, { periodMonth: v === "annual" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">سنوي</SelectItem>
                    {Array.from({ length: 12 }, (_, m) => (
                      <SelectItem key={m + 1} value={String(m + 1)}>شهر {m + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm" className="self-start" onClick={() => setLines((ls) => [...ls, { accountId: "", amount: "", periodMonth: "" }])}>
            <Plus className="size-3.5" /> سطر
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الموازنة"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
