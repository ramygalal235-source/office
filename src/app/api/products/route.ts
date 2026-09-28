import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, generateNumber, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { firstIssue, optNum, optText, reqText } from "@/lib/validators";
import { round2 } from "@/lib/money";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const category = url.searchParams.get("category") ?? "";
    const lowStock = url.searchParams.get("lowStock") === "1";

    const where = {
      ...(category ? { category } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { code: { contains: q } }, { category: { contains: q } }] } : {}),
    };

    // عدد المنتجات في مكتب محاسبي في حدود الآلاف — نحسب ملخصات المخزون مباشرة
    const [items, total, allActive] = await Promise.all([
      db.product.findMany({ where, orderBy: { name: "asc" }, skip, take }),
      db.product.count({ where }),
      lowStock ? db.product.findMany({ where: { ...where, isActive: true }, select: { quantity: true, minStock: true } }) : Promise.resolve([]),
    ]);

    const lowStockCount = allActive.filter((p) => p.quantity <= p.minStock).length;
    const stockValue = items.reduce((s, p) => s + round2(p.quantity * p.costPrice), 0);

    return ok(items, {
      page, limit, total, pages: Math.ceil(total / limit),
      lowStockCount,
      stockValue,
    });
  } catch (e) {
    return handleDbError(e);
  }
}

const productSchema = z.object({
  name: reqText(200, "اسم المنتج مطلوب"),
  category: optText(100),
  unit: optText(30),
  quantity: optNum(),
  costPrice: optNum(),
  salePrice: optNum(),
  minStock: optNum(),
  isActive: z.union([z.boolean(), z.string()]).optional().transform((v) => v !== false && v !== "false"),
  notes: optText(1000),
});

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    const parsed = productSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const created = await db.product.create({
      data: {
        code: await generateNumber("PRODUCT"),
        name: parsed.data.name,
        category: parsed.data.category || null,
        unit: parsed.data.unit || "قطعة",
        quantity: round2(parsed.data.quantity ?? 0),
        costPrice: round2(parsed.data.costPrice ?? 0),
        salePrice: round2(parsed.data.salePrice ?? 0),
        minStock: round2(parsed.data.minStock ?? 0),
        notes: parsed.data.notes || null,
      },
    });
    await auditLog("CREATE", "Product", created.id, `إضافة منتج: ${created.name}`, user?.username);
    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
