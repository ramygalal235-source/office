import { Boxes, Trash2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, round2, sumMoney } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { AssetForm } from "./asset-form";
import { AssetRowActions } from "./asset-row-actions";

export const metadata = { title: "الأصول الثابتة | دفاتر المحاسب" };

export default async function AssetsPage() {
  const session = await getSession();
  const [assets, accounts, safes] = await Promise.all([
    db.fixedAsset.findMany({
      include: { account: { select: { code: true, name: true } } },
      orderBy: { code: "asc" },
    }),
    db.safe.findMany({ where: { isActive: true }, select: { id: true, name: true, type: true }, orderBy: { name: "asc" } }),
    db.account.findMany({
      where: { code: { startsWith: "12" }, isGroup: false, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
  ]);

  const active = assets.filter((a) => a.status === "ACTIVE");
  const totalCost = sumMoney(assets.map((a) => a.cost));
  const totalAccum = sumMoney(assets.map((a) => a.accumulatedDepreciation));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="الأصول الثابتة"
        description="الأصول وعمرها الافتراضي والإهلاك — كل إهلاك يرحّل قيد يومية تلقائيًا."
        actions={
          <AssetForm
            trigger={
              <Button size="sm">
                <Boxes /> أصل جديد
              </Button>
            }
            accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="قيمة التكلفة" value={formatMoney(totalCost)} icon={Boxes} />
        <StatCard label="مجمع الإهلاك" value={formatMoney(totalAccum)} icon={Trash2} tone="warning" />
        <StatCard label="القيمة الدفترية" value={formatMoney(round2(totalCost - totalAccum))} tone="success" />
        <StatCard label="أصول نشطة" value={`${active.length}`} hint={`${assets.length} أصلًا مسجلًا`} />
      </section>

      <Card>
        <CardContent className="p-0">
          {assets.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={Boxes}
              title="لا توجد أصول بعد"
              description="أضف أول أصل (معدات، سيارات، أثاث…) وحدد عمره الافتراضي لطريقة الإهلاك."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرمز</TableHead>
                  <TableHead>الأصل</TableHead>
                  <TableHead>الحساب</TableHead>
                  <TableHead className="text-start">التكلفة</TableHead>
                  <TableHead className="text-start">مجمع الإهلاك</TableHead>
                  <TableHead className="text-start">القيمة الدفترية</TableHead>
                  <TableHead>الإهلاك الشهري</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    canAct={session?.role === "admin"}
                    safes={safes.map((x) => ({ id: x.id, label: `${x.name} (${x.type === "BANK" ? "بنك" : "خزينة"})` }))}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AssetRow({
  asset,
  canAct,
  safes,
}: {
  asset: {
    id: string;
    code: string;
    name: string;
    cost: number;
    salvageValue: number;
    lifeYears: number;
    method: string;
    accumulatedDepreciation: number;
    status: string;
    acquisitionPosted: boolean;
    account: { code: string; name: string } | null;
  };
  canAct: boolean;
  safes: { id: string; label: string }[];
}) {
  const depreciable = Math.max(0, asset.cost - asset.salvageValue);
  const book = round2(asset.cost - asset.accumulatedDepreciation);
  const monthly =
    depreciable <= 0
      ? 0
      : asset.method === "DECLINING"
        ? round2((asset.cost - asset.accumulatedDepreciation) * (1 - Math.pow(Math.max(0, asset.salvageValue / Math.max(1, asset.cost)), 1 / asset.lifeYears)))
        : round2(depreciable / asset.lifeYears / 12);
  const fullyDepreciated = asset.accumulatedDepreciation >= depreciable - 0.01;

  return (
    <TableRow>
      <TableCell className="tabular font-medium">{asset.code}</TableCell>
      <TableCell className="text-sm">
        {asset.name}
        <span className="block text-[11px] text-muted-foreground">
          {asset.method === "DECLINING" ? "تنقص" : "قسط ثابت"} — {asset.lifeYears} سنة
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {asset.account ? `${asset.account.code}` : "—"}
        {asset.acquisitionPosted && (
          <Badge variant="success" className="mr-1.5 scale-90">مرحّل</Badge>
        )}
      </TableCell>
      <TableCell className="tabular text-start font-semibold">{formatMoney(asset.cost)}</TableCell>
      <TableCell className="tabular text-start text-sm">{formatMoney(asset.accumulatedDepreciation)}</TableCell>
      <TableCell className="tabular text-start text-sm font-semibold">{formatMoney(book)}</TableCell>
      <TableCell className="tabular text-start text-sm">
        {fullyDepreciated ? (
          <Badge variant="muted">اكتمل</Badge>
        ) : (
          formatMoney(monthly)
        )}
      </TableCell>
      <TableCell>
        <Badge variant={asset.status === "ACTIVE" ? "success" : "muted"}>
          {asset.status === "ACTIVE" ? "نشط" : "مُصرَّف"}
        </Badge>
      </TableCell>
      <TableCell>
        <AssetRowActions
          id={asset.id}
          status={asset.status}
          fullyDepreciated={fullyDepreciated}
          canAct={canAct}
          acquisitionPosted={asset.acquisitionPosted}
          hasAccount={!!asset.account}
          safes={safes}
        />
      </TableCell>
    </TableRow>
  );
}
