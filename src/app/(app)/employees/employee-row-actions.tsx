"use client";

// ===== أفعال موظف: تعديل / إيقاف/تفعيل / حذف =====
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmployeeForm, type EmployeeSeed } from "./employee-form";

export function EmployeeRowActions({
  id,
  name,
  isActive,
  employee,
  canAct,
  canDelete,
}: {
  id: string;
  name: string;
  isActive: boolean;
  employee: EmployeeSeed;
  canAct: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  async function toggleActive() {
    if (busy) return;
    setBusy(true);
    const res = await apiFetch(`/api/employees/${id}`, {
      method: "PUT",
      ...jsonBody({ isActive: !isActive }),
      successMessage: isActive ? "تم إيقاف الموظف" : "تم تفعيل الموظف",
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function remove() {
    if (busy) return;
    if (!confirm(`حذف الموظف «${name}»؟ إن كان مرتبطًا بكشوف رواتب سَيُوقف بدل الحذف.`)) return;
    setBusy(true);
    const res = await apiFetch<{ deactivated?: boolean; message?: string }>(`/api/employees/${id}`, {
      method: "DELETE",
      silent: true,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(res.data?.message ?? "تم الحذف");
      router.refresh();
    } else toast.error(res.error ?? "تعذّر الحذف");
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
          {canAct && (
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil />
              تعديل
            </DropdownMenuItem>
          )}
          {canAct && (
            <DropdownMenuItem onClick={toggleActive}>
              <Power />
              {isActive ? "إيقاف" : "تفعيل"}
            </DropdownMenuItem>
          )}
          {canDelete && (
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

      {canAct && (
        <EmployeeForm employee={employee} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </>
  );
}
