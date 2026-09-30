import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleDbError, ok } from "@/lib/accounting/api";

type Ctx = { params: Promise<{ id: string }> };

/** أصل + سجل إهلاكه */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const asset = await db.fixedAsset.findUnique({
      where: { id },
      include: {
        account: { select: { code: true, name: true } },
        depreciations: { orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }] },
      },
    });
    if (!asset) return fail("الأصل غير موجود", 404);
    return ok(asset);
  } catch (e) {
    return handleDbError(e);
  }
}
