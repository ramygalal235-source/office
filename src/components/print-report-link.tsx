"use client";

// زر فتح صفحة طباعة التقرير (تنفتح في نافذة مستقلة وتُطبع تلقائيًا)
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintReportLink({ kind }: { kind: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 gap-1.5"
      onClick={() => window.open(`/print/report/${kind}`, "_blank")}
    >
      <Printer className="size-3.5" />
      طباعة / PDF
    </Button>
  );
}
