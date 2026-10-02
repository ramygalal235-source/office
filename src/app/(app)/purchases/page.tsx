import { Plus, ShoppingCart } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { formatDate, formatMoney, round2 } from "@/lib/money";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { purchaseStatusLabel } from "@/components/status-badge";
import { DocumentForm } from "../invoices/document-form";
import { DocumentRowActions } from "./document-row-actions";

export const metadata = { title: "فواتير الشراء | دفاتر المحاسب" };

export default async function PurchasesPage() {
  const session = await getSession();
  const companyId = await requireCompanyId();
  const [purchases, suppliers, accounts, products, sums] = await Promise.all([
    db.purchase.findMany({
      where: { companyId },
      include: {
        supplier: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
    db.party.findMany({ where: { companyId, type: "SUPPLIER", isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.account.findMany({ where: { type: { in: ["EXPENSE", "ASSET"] }, isActive: true, isGroup: false }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.product.findMany({ where: { companyId, isActive: true }, select: { id: true, code: true, name: true, salePrice: true, costPrice: true, unit: true }, orderBy: { name: "asc" } }),
    db.purchase.aggregate({
      where: { companyId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true, taxAmount: true, paidAmount: true },
    }),
  ]);

  const isAdmin = session?.role === "admin";
  const total = round2(sums._sum.totalAmount ?? 0);
  const tax = round2(sums._sum.taxAmount ?? 0);
  const paid = round2(sums._sum.paidAmount ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="فواتير الشراء"
        description="فواتير الموردين وترحيلها إلى قيود اليومية."
        actions={
          <DocumentForm
            kind="purchase"
            customers={[]}
            suppliers={suppliers}
            accounts={accounts}
            products={products}
            trigger={
              <Button size="sm">
                <Plus /> فاتورة شراء
              </Button>
            }
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي المشتريات" value={formatMoney(total)} icon={ShoppingCart} tone="warning" />
        <StatCard label="ضريبة المدخلات" value={formatMoney(tax)} tone="info" />
        <StatCard label="المسدَّد" value={formatMoney(paid)} tone="success" />
        <StatCard label="مستحق للموردين" value={formatMoney(total - paid)} tone={total - paid > 0 ? "warning" : "default"} />
      </section>

      <Card>
        <CardContent className="p-0">
          {purchases.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={ShoppingCart}
              title="لا توجد فواتير شراء"
              description="أنشئ أول فاتورة شراء، ويمكن ترحيلها مباشرة إلى قيود اليومية."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الرقم</TableHead>
                  <TableHead>المورد</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead className="text-start">الإجمالي</TableHead>
                  <TableHead className="text-start">الضريبة</TableHead>
                  <TableHead>الترحيل</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => {
                  const st = purchaseStatusLabel(p.status);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="tabular font-medium">{p.purchaseNumber}</TableCell>
                      <TableCell className="text-sm">{p.supplier?.name ?? "—"}</TableCell>
                      <TableCell className="tabular text-sm">{formatDate(p.date)}</TableCell>
                      <TableCell className="tabular text-start font-semibold">{formatMoney(p.totalAmount)}</TableCell>
                      <TableCell className="tabular text-start text-sm text-muted-foreground">
                        {formatMoney(p.taxAmount)}
                      </TableCell>
                      <TableCell>
                        {p.journalPosted ? <Badge variant="success">مرحّلة</Badge> : <Badge variant="muted">لم تُرحّل</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <DocumentRowActions
                          id={p.id}
                          endpoint="/api/purchases"
                          doc={{
                            id: p.id,
                            number: p.purchaseNumber,
                            date: p.date,
                            totalAmount: p.totalAmount,
                            taxAmount: p.taxAmount,
                            paidAmount: p.paidAmount,
                            journalPosted: p.journalPosted,
                            party: p.supplier,
                            items: p.items,
                          }}
                          canPost={session?.role !== "viewer"}
                          canDelete={isAdmin}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
