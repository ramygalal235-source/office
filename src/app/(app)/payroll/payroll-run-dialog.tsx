"use client";

// ===== شغل الرواتب: إنشاء شغل جديد + أفعال الشغل (عرض/ترحيل/صرف) =====
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Eye, FileText, Loader2, MoreHorizontal, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PayslipView = {
  employeeName: string;
  basic: number;
  allowances: number;
  overtime: number;
  bonuses: number;
  insurance: number;
  tax: number;
  otherDeductions: number;
  net: number;
};

type SafeOption = { id: string; label: string };

/** زر إنشاء شغل رواتب لفترة */
export function NewRunDialog({
  defaultYear,
  defaultMonth,
}: {
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(String(defaultYear));
  const [month, setMonth] = useState(String(defaultMonth));

  async function createRun() {
    setBusy(true);
    const res = await apiFetch<{ id: string; totalNet: number }>(`/api/payroll`, {
      method: "POST",
      ...jsonBody({ year: Number(year), month: Number(month) }),
      silent: true,
    });
    setBusy(false);
    if (res.ok) {
      toast.success("تم إنشاء شغل الرواتب بحالة مسودة — راجعه ثم رحّله");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "تعذّر إنشاء شغل الرواتب");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Banknote /> شغل رواتب
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>شغل رواتب جديد</DialogTitle>
          <DialogDescription>
            يُحسب تلقائيًا لكل الموظفين النشطين: أساس + مستحقات − تأمينات − ضريبة = صافي.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>الشهر</Label>
            <Input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>السنة</Label>
            <Input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(e.target.value)} dir="ltr" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={createRun} disabled={busy}>{busy ? "جارٍ الحساب..." : "حساب الشغل"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** أفعال شغل موجود: عرض القسائم / ترحيل / صرف */
export function RunRowActions({
  id,
  status,
  paidAt,
  totalNet,
  payslips,
  safes,
  isAdmin,
}: {
  id: string;
  status: string;
  paidAt: string | null;
  totalNet: number;
  payslips: PayslipView[];
  safes: SafeOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [payslipsOpen, setPayslipsOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [safeId, setSafeId] = useState("");

  async function post() {
    if (busy) return;
    if (!confirm(`ترحيل شغل الرواتب إلى قيود اليومية؟ (مصروف شامل مساهمة صاحب العمل)`)) return;
    setBusy(true);
    const res = await apiFetch<{ journalNumber?: string; expenseTotal?: number }>(`/api/payroll/${id}/post`, {
      method: "POST",
      silent: true,
    });
    setBusy(false);
    if (res.ok) toast.success(`تم الترحيل${res.data?.journalNumber ? ` — قيد ${res.data.journalNumber}` : ""}`);
    else toast.error(res.error ?? "تعذّر الترحيل");
    router.refresh();
  }

  async function pay() {
    if (busy || !safeId) return;
    if (!confirm(`صرف ${formatMoney(totalNet)} من ${safes.find((s) => s.id === safeId)?.label ?? ""}؟`)) return;
    setBusy(true);
    const res = await apiFetch<{ journalNumber?: string }>(`/api/payroll/${id}/pay`, {
      method: "POST",
      ...jsonBody({ safeId }),
      silent: true,
    });
    setBusy(false);
    setPayOpen(false);
    if (res.ok) toast.success(`تم صرف الرواتب${res.data?.journalNumber ? ` — قيد ${res.data.journalNumber}` : ""}`);
    else toast.error(res.error ?? "تعذّر الصرف");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setPayslipsOpen(true)}>
            <Eye />
            عرض القسائم
          </DropdownMenuItem>
          {status !== "DRAFT" && (
            <DropdownMenuItem onClick={() => window.open(`/print/payslip/${id}`, "_blank")}>
              <FileText />
              طباعة القسائم
            </DropdownMenuItem>
          )}
          {isAdmin && status === "DRAFT" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={post}>
                <Send />
                ترحيل إلى اليومية
              </DropdownMenuItem>
            </>
          )}
          {isAdmin && status === "POSTED" && !paidAt && (
            <DropdownMenuItem onClick={() => setPayOpen(true)}>
              <Wallet />
              صرف الصافي
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* القسائم */}
      <Dialog open={payslipsOpen} onOpenChange={setPayslipsOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>قسائم الرواتب</DialogTitle>
            <DialogDescription>
              {payslips.length} موظفًا — الإجمالي الصافي {formatMoney(totalNet)}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  <th className="p-2 text-start text-xs font-semibold">الموظف</th>
                  <th className="p-2 text-start text-xs font-semibold">الإجمالي</th>
                  <th className="p-2 text-start text-xs font-semibold">التأمينات</th>
                  <th className="p-2 text-start text-xs font-semibold">الضريبة</th>
                  <th className="p-2 text-start text-xs font-semibold">الصافي</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-medium">{p.employeeName}</td>
                    <td className="tabular p-2">{formatMoney(p.basic + p.allowances + p.overtime + p.bonuses)}</td>
                    <td className="tabular p-2 text-muted-foreground">
                      {formatMoney(p.insurance + p.otherDeductions)}
                      {p.tax > 0 && <span className="block text-[10px]">ضريبة {formatMoney(p.tax)}</span>}
                    </td>
                    <td className="tabular p-2 text-muted-foreground">{formatMoney(p.tax)}</td>
                    <td className="tabular p-2 font-semibold">{formatMoney(p.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* الصرف */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>صرف الصافي</DialogTitle>
            <DialogDescription>
              يُرحّل: مدين «رواتب مستحقة» — دائن حساب الخزينة/البنك ({formatMoney(totalNet)}).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label>من حساب</Label>
            <Select value={safeId || undefined} onValueChange={setSafeId}>
              <SelectTrigger><SelectValue placeholder="اختر الخزينة/البنك" /></SelectTrigger>
              <SelectContent>
                {safes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPayOpen(false)}>إلغاء</Button>
            <Button onClick={pay} disabled={busy || !safeId}>{busy ? "جارٍ الصرف..." : "تأكيد الصرف"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
