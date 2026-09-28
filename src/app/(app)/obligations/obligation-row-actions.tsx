"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { OBLIGATION_STATUSES } from "@/lib/domain";
import { obligationStatusLabel } from "@/components/status-badge";

type Props = {
  id: string;
  status: string;
  title: string;
  canDelete: boolean;
};

export function ObligationRowActions({ id, status, title, canDelete }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: string) {
    if (busy || next === status) return;
    setBusy(true);
    const res = await apiFetch(`/api/obligations/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status: next }),
      successMessage: "تم تحديث حالة الالتزام",
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  async function remove() {
    if (busy) return;
    if (!confirm(`هل تريد حذف «${title}»؟`)) return;
    setBusy(true);
    const res = await apiFetch(`/api/obligations/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>تغيير الحالة</DropdownMenuLabel>
        {OBLIGATION_STATUSES.map((s) => {
          const meta = obligationStatusLabel(s);
          return (
            <DropdownMenuItem
              key={s}
              onClick={() => setStatus(s)}
              className={s === status ? "font-semibold text-primary" : undefined}
            >
              {s === status ? <CheckCircle2 className="size-4" /> : <span className="size-4" />}
              {meta.label}
            </DropdownMenuItem>
          );
        })}
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={remove}>
              <Trash2 />
              حذف الالتزام
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
