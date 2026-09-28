import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ProductsBoard, type BoardProduct } from "@/components/products-board";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = await getSession();
  if (!user) return null;

  const products = await db.product.findMany({ orderBy: { name: "asc" }, take: 1000 });

  const rows: BoardProduct[] = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    category: p.category,
    unit: p.unit,
    quantity: p.quantity,
    costPrice: p.costPrice,
    salePrice: p.salePrice,
    minStock: p.minStock,
    isActive: p.isActive,
    notes: p.notes,
    lowStock: p.isActive && p.quantity <= p.minStock,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="المنتجات والمخزون"
        description="أصناف المخزون برصيدها — تُحدَّث آليًا مع ترحيل المبيعات والمشتريات، وتُسوَّى يدويًا عند الجرد."
      />
      <ProductsBoard initialProducts={rows} userRole={user.role} />
    </>
  );
}
