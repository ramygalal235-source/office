"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { Button } from "@/components/ui/button";

export function ReverseButton({ id, disabled }: { id: string; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reverse() {
    if (busy) return;
    if (!confirm("سيُنشأ قيد عكسي في تاريخ اليوم. القيد الأصلي لن يُحذف. متابعة؟")) return;
    setBusy(true);
    const res = await apiFetch(`/api/journal/${id}/reverse`, {
      method: "POST",
      successMessage: "تم إنشاء القيد العكسي",
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <Button variant="ghost" size="sm" onClick={reverse} disabled={disabled || busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
      عكس
    </Button>
  );
}
