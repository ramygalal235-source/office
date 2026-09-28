import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  className?: string;
}) {
  const toneClass = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/12 text-destructive",
    info: "bg-info/12 text-info",
  }[tone];

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-xs text-muted-foreground">{label}</span>
          <span className="tabular text-lg font-bold leading-tight">{value}</span>
          {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
        </div>
        {Icon && (
          <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", toneClass)}>
            <Icon className="size-4" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
