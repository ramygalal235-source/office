import { Plus, Receipt } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
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
import { etaStatusLabel, invoiceStatusLabel } from "@/components/status-badge";
import { DocumentForm } from "./document-form";
import { DocumentRowActions } from "./document-row-actions";

export const metadata = { title: "فواتير البيع | دفاتر المحاسب" };

export default async function InvoicesPage() {
  const session = await getSession();
  const [invoices, customers, accounts, products, sums] = await Promise.all([
    db.invoice.findMany({
      include: {
        customer: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: { date: "desc" },
      take: 100,
    }),
    db.party.findMany({ where: { type: "CUSTOMER", isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.account.findMany({ where: { type: "INCOME", isActive: true, isGroup: false }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    db.product.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, salePrice: true, costPrice: true, unit: true }, orderBy: { name: "asc" } }),
    db.invoice.aggregate({
      where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { totalAmount: true, taxAmount: true, paidAmount: true },
    }),
  ]);

  const isAdmin = session?.role === "admin";
  const total = round2(sums._sum.totalAmount ?? 0);
  const tax = round2(sums._sum.taxAmount ?? 0);
  const paid = round2(sums._sum.paidAmount ?? 0);
  const open = round2(total - paid);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="فواتير البيع"
        description="فواتير العملاء ومتابعة ترحيلها إلى قيود اليومية والفوترة الإلكترونية."
        actions={
          <DocumentForm
            kind="invoice"
            customers={customers}
            suppliers={[]}
            accounts={accounts}
            products={products}
            trigger={
              <Button size="sm">
                <Plus /> فاتورة بيع
              </Button>
            }
          />
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="إجمالي الفواتير" value={formatMoney(total)} icon={Receipt} />
        <StatCard label="ضريبة القيمة المضافة" value={formatMoney(tax)} tone="info" />
        <StatCard label="المحصّل" value={formatMoney(paid)} tone="success" />
        <StatCard label="مستحق على العملاء" value={formatMoney(open)} tone={open > 0 ? "warning" : "default"} />
      </section>

      <Card>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <EmptyState
              className="m-4 border-0"
              icon={Receipt}
              title="لا توجد فواتير بعد"
              description="أنشئ أول فاتورة بيع، ويمكن ترحيلها مباشرة إلى قيود اليومية."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الفاتورة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>التاريخ</TableHead>
                  <TableHead className="text-start">الإجمالي</TableHead>
                  <TableHead className="text-start">الضريبة</TableHead>
                  <TableHead>الترحيل</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الهيئة</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const st = invoiceStatusLabel(inv.status);
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="tabular font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-sm">{inv.customer?.name ?? "—"}</TableCell>
                      <TableCell className="tabular text-sm">{formatDate(inv.date)}</TableCell>
                      <TableCell className="tabular text-start font-semibold">
                        {formatMoney(inv.totalAmount)}
                      </TableCell>
                      <TableCell className="tabular text-start text-sm text-muted-foreground">
                        {formatMoney(inv.taxAmount)}
                      </TableCell>
                      <TableCell>
                        {inv.journalPosted ? (
                          <Badge variant="success">مرحّلة</Badge>
                        ) : (
                          <Badge variant="muted">لم تُرحّل</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {inv.etaStatus ? (
                          <Badge variant={etaStatusLabel(inv.etaStatus).variant} title={inv.etaError ?? undefined}>
                            {etaStatusLabel(inv.etaStatus).label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DocumentRowActions
                          id={inv.id}
                          endpoint="/api/invoices"
                          doc={{
                            id: inv.id,
                            number: inv.invoiceNumber,
                            date: inv.date,
                            totalAmount: inv.totalAmount,
                            taxAmount: inv.taxAmount,
                            paidAmount: inv.paidAmount,
                            journalPosted: inv.journalPosted,
                            party: inv.customer,
                            items: inv.items,
                          }}
                          canPost={session?.role !== "viewer"}
                          canDelete={isAdmin}
                          eta={{ status: inv.etaStatus }}
                          canEta={isAdmin}
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
