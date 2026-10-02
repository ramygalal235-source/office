"use client";

// ===== معاملات الرواتب (مدير): تأمينات + شرائح ضريبة الدخل =====
import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Bracket = { upTo: number | null; rate: number };

type Params = {
  insuranceRate: number;
  employerInsuranceRate: number;
  insuranceCeiling: number;
  whtBrackets: Bracket[];
};

export function PayrollParamsCard() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [params, setParams] = useState<Params | null>(null);

  async function load() {
    const res = await apiFetch<Params>("/api/payroll/params");
    if (res.ok && res.data) {
      setParams({
        ...res.data,
        whtBrackets: res.data.whtBrackets.map((b, i, arr) => ({
          upTo: Number.isFinite(b.upTo) ? b.upTo : i === arr.length - 1 ? null : b.upTo,
          rate: b.rate,
        })),
      });
    }
    setLoaded(true);
  }

  useEffect(() => {
    void load();
    // يُحمَّل مرة عند الفتح الأول فقط
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open && !loaded) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <ChevronDown /> معاملات الرواتب (تأمينات وضرائب)
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">معاملات الرواتب</CardTitle>
          <CardDescription>
            المعدلات تتغير بقوانين — تُعدَّل هنا وتُطبَّق على الشغل الجديد. الشرائح على الدخل الشهري بعد التأمينات.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>إخفاء</Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!params ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> جارٍ التحميل...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>تأمينات الموظف %</Label>
                <Input type="number" step="0.1" min="0" dir="ltr" value={params.insuranceRate}
                  onChange={(e) => setParams({ ...params, insuranceRate: Number(e.target.value) })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>تأمينات صاحب العمل %</Label>
                <Input type="number" step="0.1" min="0" dir="ltr" value={params.employerInsuranceRate}
                  onChange={(e) => setParams({ ...params, employerInsuranceRate: Number(e.target.value) })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>سقف أجر التأمين (ج.م/شهر)</Label>
                <Input type="number" step="100" min="0" dir="ltr" value={params.insuranceCeiling}
                  onChange={(e) => setParams({ ...params, insuranceCeiling: Number(e.target.value) })} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>شرائح ضريبة دخل العمالة (شهري)</Label>
              <div className="flex flex-col gap-1.5">
                {params.whtBrackets.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">
                      حتى {b.upTo === null ? "∞" : b.upTo.toLocaleString("ar-EG")}
                    </span>
                    <Input
                      type="number"
                      step="100"
                      min="0"
                      disabled={b.upTo === null}
                      dir="ltr"
                      value={b.upTo ?? ""}
                      onChange={(e) => {
                        const brackets = [...params.whtBrackets];
                        brackets[i] = { ...b, upTo: Number(e.target.value) || 0 };
                        setParams({ ...params, whtBrackets: brackets });
                      }}
                      className="w-32"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      dir="ltr"
                      value={b.rate}
                      onChange={(e) => {
                        const brackets = [...params.whtBrackets];
                        brackets[i] = { ...b, rate: Number(e.target.value) || 0 };
                        setParams({ ...params, whtBrackets: brackets });
                      }}
                      className="w-20"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  const res = await apiFetch("/api/payroll/params", {
                    method: "PUT",
                    ...jsonBody(params),
                    successMessage: "تم حفظ معاملات الرواتب",
                  });
                  setSaving(false);
                  if (!res.ok) toast.error(res.error ?? "تعذّر الحفظ");
                }}
              >
                {saving ? "جارٍ الحفظ..." : "حفظ المعاملات"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
