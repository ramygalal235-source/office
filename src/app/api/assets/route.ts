import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, generateNumber, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { bookValue, monthlyDepreciationAmount } from "@/lib/assets";

/** قائمة الأصول الثابتة */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const [assets, total] = await Promise.all([
      db.fixedAsset.findMany({
        where: { status: url.searchParams.get("status") ?? undefined },
        include: { account: { select: { code: true, name: true } } },
        orderBy: { code: "asc" },
        skip,
        take,
      }),
      db.fixedAsset.count(),
    ]);

    return ok(
      assets.map((a) => ({
        ...a,
        bookValue: bookValue(a),
        monthlyDepreciation: monthlyDepreciationAmount(a),
      })),
      { page, limit, total, pages: Math.ceil(total / limit) }
    );
  } catch (e) {
    return handleDbError(e);
  }
}

/** إنشاء أصل */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      name?: string;
      category?: string;
      cost?: number;
      salvageValue?: number;
      lifeYears?: number;
      method?: string;
      acquisitionDate?: string;
      accountId?: string | null;
      depreciationAccountId?: string | null;
      notes?: string;
    } | null;
    if (!body?.name || !body.cost || body.cost <= 0) return fail("اسم الأصل والتكلفة مطلوبتان", 400);
    if (!body.lifeYears || body.lifeYears <= 0) return fail("عمر الأصل الافتراضي يجب أن يكون أكثر من صفر", 400);
    if (body.method && !["STRAIGHT_LINE", "DECLINING"].includes(body.method)) return fail("طريقة إهلاك غير معروفة", 400);

    const code = await generateNumber("ASSET");
    const asset = await db.fixedAsset.create({
      data: {
        code,
        name: body.name,
        category: body.category ?? null,
        cost: body.cost,
        salvageValue: body.salvageValue ?? 0,
        lifeYears: body.lifeYears,
        method: body.method ?? "STRAIGHT_LINE",
        acquisitionDate: body.acquisitionDate ? new Date(body.acquisitionDate) : new Date(),
        accountId: body.accountId ?? null,
        depreciationAccountId: body.depreciationAccountId ?? null,
        notes: body.notes ?? null,
      },
      include: { account: { select: { code: true, name: true } } },
    });

    await auditLog("CREATE", "FixedAsset", asset.id, `إنشاء أصل ثابت: ${asset.name} (${code})`);
    return ok(asset, { bookValue: bookValue(asset) });
  } catch (e) {
    return handleDbError(e);
  }
}
