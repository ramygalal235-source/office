import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getSessionUser, fail } from "@/lib/accounting/api";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/company-context";

export const dynamic = "force-dynamic";

/** تعيين الشركة النشطة (دفاتر مستقلة لكل شركة) — يُخزَّن في كوكي الجلسة */
export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("انتهت الجلسة", 401);

  const body = (await req.json().catch(() => null)) as { companyId?: string } | null;
  const companyId = body?.companyId ?? "";
  if (!companyId) return fail("معرف الشركة مطلوب");

  const company = await db.clientCompany.findUnique({ where: { id: companyId } });
  if (!company || !company.isActive) return fail("الشركة غير موجودة أو موقوفة");

  const store = await cookies();
  store.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true, companyId: company.id, name: company.nameAr });
}
