import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { auditLog, fail, generateNumber, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { lineTotal, round2, sumMoney } from "@/lib/money";
import { invoiceSchema } from "./schema";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const status = url.searchParams.get("status") ?? "";
    const customerId = url.searchParams.get("customerId") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();

    const companyId = await requireCompanyId();
    const where = {
      companyId,
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(q ? { invoiceNumber: { contains: q } } : {}),
    };

    const [items, total, sums] = await Promise.all([
      db.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: "desc" },
        skip,
        take,
      }),
      db.invoice.count({ where }),
      db.invoice.aggregate({
        where: { ...where, status: { notIn: ["DRAFT", "CANCELLED"] } },
        _sum: { totalAmount: true, taxAmount: true, paidAmount: true },
      }),
    ]);

    return ok(items, {
      page, limit, total, pages: Math.ceil(total / limit),
      totals: sums._sum,
    });
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = invoiceSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { items, discount, ...header } = parsed.data;
    const user = getSessionUser(req);

    const lines = items.map((item, index) => {
      const t = lineTotal(item);
      return {
        productId: item.productId || null,
        description: item.description,
        quantity: round2(item.quantity),
        unitPrice: round2(item.unitPrice),
        discount: round2(item.discount),
        taxRate: round2(item.taxRate),
        lineNet: t.net,
        lineTax: t.tax,
        lineTotal: t.total,
        accountId: item.accountId || null,
        sortOrder: index,
      };
    });

    const subtotal = sumMoney(lines.map((l) => l.quantity * l.unitPrice));
    const net = round2(subtotal - discount);
    const taxAmount = sumMoney(lines.map((l) => l.lineTax));
    const totalAmount = round2(net + taxAmount);

    const invoiceNumber = await generateNumber("INVOICE");

    // الفاتورة تُسجَّل على دفاتر الشركة النشطة (لا من بيانات العميل)
    const companyId = await requireCompanyId();
    const created = await db.invoice.create({
      data: {
        ...header,
        companyId,
        invoiceNumber,
        subtotal,
        discount,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        createdBy: user?.username ?? "system",
        items: { create: lines },
      },
      include: { items: true },
    });

    await auditLog("CREATE", "Invoice", created.id, `فاتورة بيع ${invoiceNumber} بمبلغ ${totalAmount}`, user?.username);
    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
