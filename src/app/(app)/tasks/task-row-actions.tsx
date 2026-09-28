"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
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
import { TASK_STATUSES } from "@/lib/domain";
import { taskStatusLabel } from "@/components/status-badge";

export function TaskRowActions({
  id,
  status,
  title,
  canDelete,
}: {
  id: string;
  status: string;
  title: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(data: Record<string, unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    const res = await apiFetch(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      successMessage: message,
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  async function toggleDone() {
    await patch(
      { status: status === "DONE" ? "TODO" : "DONE" },
      status === "DONE" ? "أُعيدت المهمة للقائمة" : "تم إنجاز المهمة"
    );
  }

  async function remove() {
    if (busy) return;
    if (!confirm(`هل تريد حذف «${title}»؟`)) return;
    setBusy(true);
    const res = await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        title={status === "DONE" ? "إعادة فتح" : "إنجاز"}
        disabled={busy}
        onClick={toggleDone}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Check className={status === "DONE" ? "text-success" : ""} />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" disabled={busy}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>تغيير الحالة</DropdownMenuLabel>
          {TASK_STATUSES.map((s) => (
            <DropdownMenuItem
              key={s}
              onClick={() => patch({ status: s }, "تم تحديث حالة المهمة")}
              className={s === status ? "font-semibold text-primary" : undefined}
            >
              {s === status ? <Check className="size-4" /> : <span className="size-4" />}
              {taskStatusLabel(s).label}
            </DropdownMenuItem>
          ))}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={remove}>
                <Trash2 />
                حذف المهمة
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
