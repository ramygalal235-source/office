"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Landmark, Loader2, MoreHorizontal, Printer, RefreshCw, Send, Trash2 } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatMoney } from "@/lib/money";
import { formatNumber } from "@/lib/money";

type Doc = {
  id: string;
  number: string;
  date: Date | string;
  totalAmount: number;
  taxAmount: number;
  paidAmount: number;
  journalPosted: boolean;
  party: { name: string } | null;
  items: { description: string; quantity: number; unitPrice: number; lineTotal: number; taxRate: number }[];
};

export function DocumentRowActions({
  id,
  endpoint,
  doc,
  canPost,
  canDelete,
  eta,
  canEta,
}: {
  id: string;
  endpoint: string;
  doc: Doc;
  canPost: boolean;
  canDelete: boolean;
  // حالة الفاتورة لدى هيئة الضرائب — تُمرَّر لفواتير البيع فقط
  eta?: { status: string | null };
  canEta?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);

  async function post() {
    if (busy || doc.journalPosted) return;
    if (!confirm("ترحيل المستند إلى قيود اليومية؟")) return;
    setBusy(true);
    const res = await apiFetch(`${endpoint}/${id}/post`, {
      method: "POST",
      successMessage: "تم الترحيل إلى قيود اليومية",
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  function printDoc() {
    const kind = endpoint.includes("invoices") ? "invoice" : "purchase";
    window.open(`/print/${kind}/${id}`, "_blank");
  }

  async function etaAction(action: "submit" | "refresh") {
    if (busy) return;
    if (action === "submit" && !confirm("إرسال هذه الفاتورة إلى هيئة الضرائب (ETA)؟")) return;
    setBusy(true);
    const res = await apiFetch<{ message: string }>(`${endpoint}/${id}/eta`, {
      method: "POST",
      ...jsonBody({ action }),
      silent: true,
    });
    if (res.ok && res.data) {
      if (res.data.message) toast(res.data.message);
    } else {
      toast.error(res.error ?? "تعذّر الإجراء");
    }
    router.refresh();
    setBusy(false);
  }

  async function remove() {
    if (busy) return;
    if (!confirm("حذف هذا المستند نهائيًا؟")) return;
    setBusy(true);
    const res = await apiFetch(`${endpoint}/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    setBusy(false);
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
          <DropdownMenuItem onClick={() => setViewing(true)}>
            <Eye />
            عرض السطور
          </DropdownMenuItem>
          <DropdownMenuItem onClick={printDoc}>
            <Printer />
            طباعة / PDF
          </DropdownMenuItem>
          {canPost && !doc.journalPosted && (
            <DropdownMenuItem onClick={post}>
              <Send />
              ترحيل إلى اليومية
            </DropdownMenuItem>
          )}
          {eta && canEta && doc.journalPosted && eta.status === null && (
            <DropdownMenuItem onClick={() => etaAction("submit")}>
              <Landmark />
              إرسال إلى الهيئة (ETA)
            </DropdownMenuItem>
          )}
          {eta && canEta && doc.journalPosted && eta.status !== null && eta.status !== "ACCEPTED" && (
            <DropdownMenuItem onClick={() => etaAction("refresh")}>
              <RefreshCw />
              تحديث حالة الهيئة
            </DropdownMenuItem>
          )}
          {eta && eta.status === "ACCEPTED" && (
            <DropdownMenuItem disabled>
              <Landmark />
              مقبولة لدى الهيئة
            </DropdownMenuItem>
          )}
          {canDelete && !doc.journalPosted && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={remove}>
                <Trash2 />
                حذف
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={viewing} onOpenChange={setViewing}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="tabular">{doc.number}</DialogTitle>
            <DialogDescription>
              {doc.party?.name ?? "—"} • {formatDate(doc.date)} • الإجمالي{" "}
              {formatMoney(doc.totalAmount)} (ضريبة {formatMoney(doc.taxAmount)})
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className="p-2 text-start text-xs font-semibold">الوصف</th>
                  <th className="p-2 text-center text-xs font-semibold">الكمية</th>
                  <th className="p-2 text-center text-xs font-semibold">السعر</th>
                  <th className="p-2 text-start text-xs font-semibold">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{it.description}</td>
                    <td className="tabular p-2 text-center">{formatNumber(it.quantity)}</td>
                    <td className="tabular p-2 text-center">{formatNumber(it.unitPrice)}</td>
                    <td className="tabular p-2 text-start font-medium">
                      {formatNumber(it.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={printDoc}>
              <Printer className="size-3.5" />
              طباعة / PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
