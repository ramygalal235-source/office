"use client";

// ===== أفعال موازنة: تحديث الفعلي / تفعيل / إغلاق / حذف =====
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function BudgetRowActions({
  id,
  status,
  isAdmin,
}: {
  id: string;
  status: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "refresh" | "activate" | "close" | "delete") {
    if (busy) return;
    if (action === "delete" && !confirm("حذف الموازنة؟ (لا يُحذف إن كانت مغلقة)")) return;
    setBusy(true);
    const res =
      action === "refresh"
        ? await apiFetch(`/api/budgets/${id}/refresh`, { method: "POST", successMessage: "تم تحديث الفعلي من القيود" })
        : action === "delete"
          ? await apiFetch(`/api/budgets/${id}`, { method: "DELETE", successMessage: "تم حذف الموازنة" })
          : await apiFetch(`/api/budgets/${id}`, {
              method: "PUT",
              ...jsonBody({ status: action === "activate" ? "ACTIVE" : "CLOSED" }),
              successMessage: action === "activate" ? "تم تفعيل الموازنة" : "تم إغلاق الموازنة",
            });
    setBusy(false);
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "تعذّر الإجراء");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => act("refresh")}>
          <RefreshCw />
          تحديث الفعلي
        </DropdownMenuItem>
        {isAdmin && status === "DRAFT" && (
          <DropdownMenuItem onClick={() => act("activate")}>
            <CheckCircle2 />
            تفعيل
          </DropdownMenuItem>
        )}
        {isAdmin && status === "ACTIVE" && (
          <DropdownMenuItem onClick={() => act("close")}>
            <CheckCircle2 />
            إغلاق
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={() => act("delete")}>
              <Trash2 />
              حذف
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
