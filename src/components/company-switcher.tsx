"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CompanyOption {
  id: string;
  code: string;
  name: string;
  kind: string; // OFFICE | CLIENT
}

/**
 * مبدّل الشركات النشطة: كل شركة لها دفاتر مستقلة (المكتب + العملاء).
 * الاختيار يُحفظ في كوكي ويُحدَّث كل الصفحات فورًا (refresh).
 */
export function CompanySwitcher({
  companies,
  activeCompanyId,
}: {
  companies: CompanyOption[];
  activeCompanyId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active = companies.find((c) => c.id === activeCompanyId) ?? companies[0];

  async function select(id: string) {
    if (busy || id === activeCompanyId) return;
    setBusy(true);
    const res = await fetch("/api/company/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: id }),
    });
    setBusy(false);
    if (res.ok) {
      const company = companies.find((c) => c.id === id);
      toast.success(`تم فتح دفاتر: ${company?.name ?? ""}`);
      router.refresh();
    } else {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(err?.error ?? "تعذّر تبديل الشركة");
    }
  }

  if (!companies.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 px-2">
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Store className="size-4 text-primary" />
          )}
          <span className="hidden max-w-40 truncate text-sm font-medium md:inline">
            {active?.name ?? "اختر الشركة"}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>الشركة النشطة — الدفاتر المعروضة</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => select(c.id)} disabled={busy}>
            <span className="flex w-full items-center gap-2">
              <Building2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{c.name}</span>
              {c.kind === "OFFICE" && (
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  المكتب
                </span>
              )}
              {c.id === activeCompanyId && <Check className="size-4 shrink-0 text-primary" />}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
