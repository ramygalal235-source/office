"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** فتح دفاتر الشركة النشطة (تبديل النطاق المحاسبي ثم الانتقال للوحة التحكم) */
export function OpenBooksButton({ companyId, companyName }: { companyId: string; companyName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/company/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`تم فتح دفاتر ${companyName}`);
      router.push("/");
      router.refresh();
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(err?.error ?? "تعذّر فتح الدفاتر");
    }
  }

  return (
    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={open} disabled={busy}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <BookOpenText className="size-3.5" />}
      فتح الدفاتر
    </Button>
  );
}
