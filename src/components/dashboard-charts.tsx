"use client";

// ===== رسوم بيانية للوحة التحكم — بيانات حقيقية من قاعدة البيانات =====
// (recharts عبر غلاف chart.tsx — نفس المكوّن المستعار من shadcn)
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const moneyShort = (v: number) =>
  Math.abs(v) >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)} م`
    : Math.abs(v) >= 1000
      ? `${(v / 1000).toFixed(0)} ألف`
      : v.toFixed(0);

const revenueConfig = {
  net: { label: "صافي المبيعات", color: "#0d7a5f" },
  tax: { label: "ضريبة", color: "#94a3b8" },
} satisfies ChartConfig;

const receivablesConfig = {
  balance: { label: "الرصيد المستحق", color: "#d97706" },
} satisfies ChartConfig;

const obligationsConfig = {
  upcoming: { label: "استحقاقات", color: "#0d7a5f" },
  overdue: { label: "متأخر", color: "#dc2626" },
} satisfies ChartConfig;

export function DashboardCharts({
  monthlyRevenue,
  receivables,
  obligations,
}: {
  monthlyRevenue: { month: string; net: number; tax: number }[];
  receivables: { name: string; balance: number }[];
  obligations: { month: string; upcoming: number; overdue: number }[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">إيرادات آخر 12 شهرًا (فواتير غير مسودة)</CardTitle>
        </CardHeader>
        <CardContent>
          <div dir="ltr" className="h-56">
            <ChartContainer config={revenueConfig} className="h-full w-full">
              <AreaChart data={monthlyRevenue} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => moneyShort(v)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => [
                        formatMoney(Number(value)),
                        revenueConfig[name as keyof typeof revenueConfig]?.label ?? name,
                      ]}
                    />
                  }
                />
                <Area type="monotone" dataKey="tax" fill="var(--color-tax)" stroke="var(--color-tax)" fillOpacity={0.25} strokeWidth={1} />
                <Area type="monotone" dataKey="net" fill="var(--color-net)" stroke="var(--color-net)" fillOpacity={0.3} strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ذمم العملاء (أعلى 8 أرصدة)</CardTitle>
        </CardHeader>
        <CardContent>
          {receivables.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
              لا توجد ذمم مستحقة حاليًا
            </div>
          ) : (
            <div dir="ltr" className="h-56">
              <ChartContainer config={receivablesConfig} className="h-full w-full">
                <BarChart data={receivables} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: number) => moneyShort(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={110}
                    tick={{ fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideIndicator
                        formatter={(value) => [formatMoney(Number(value)), "الرصيد المستحق"]}
                      />
                    }
                  />
                  <Bar dataKey="balance" fill="var(--color-balance)" radius={4} barSize={14} />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">الالتزامات الضريبية — 6 أشهر قادمة</CardTitle>
        </CardHeader>
        <CardContent>
          <div dir="ltr" className="h-56">
            <ChartContainer config={obligationsConfig} className="h-full w-full">
              <BarChart data={obligations} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="upcoming" stackId="a" fill="var(--color-upcoming)" radius={[0, 0, 0, 0]} barSize={22} />
                <Bar dataKey="overdue" stackId="a" fill="var(--color-overdue)" radius={[4, 4, 0, 0]} barSize={22} />
              </BarChart>
            </ChartContainer>
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[#0d7a5f]" /> استحقاقات مقبلة
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-[#dc2626]" /> متأخرة
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
