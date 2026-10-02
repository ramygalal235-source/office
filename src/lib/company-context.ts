import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

/**
 * النطاق المحاسبي: كل شركة (المكتب نفسه + شركات العملاء) لها دفاتر مستقلة.
 *
 * - «المكتب» شركة خاصة (code = OFFICE, kind = OFFICE) تحمل دفاتره الذاتية.
 * - الشركة النشطة تُخزَّن في كوكي (يُعدَّل من مبدّل الشركات في الهيدر) حتى
 *   تبقى اختيار المستخدم بين الطلبات دون إعادة تسجيل دخول.
 * - كل كتابة على نماذج الدفاتر تمر بـ requireCompanyId() لتُسجَّل على
 *   الشركة النشطة، وكل قراءة (صفحات/تقارير/محرك الأرصدة) تُفلتر به.
 */

export const ACTIVE_COMPANY_COOKIE = "dafater_active_company";
export const OFFICE_COMPANY_CODE = "OFFICE";

export interface CompanyOption {
  id: string;
  code: string;
  name: string;
  kind: string; // OFFICE | CLIENT
}

/** شركة المكتب الخاصة — تُنشأ عند أول استخدام إن لم توجد (idempotent) */
export async function getOfficeCompany() {
  const existing = await db.clientCompany.findUnique({ where: { code: OFFICE_COMPANY_CODE } });
  if (existing) return existing;

  try {
    return await db.clientCompany.create({
      data: {
        code: OFFICE_COMPANY_CODE,
        nameAr: "دفاتر المكتب",
        entityType: "COMPANY",
        kind: "OFFICE",
        isActive: true,
      },
    });
  } catch {
    // سباق إنشاء متوازٍ — نعيد القراءة
    return (
      (await db.clientCompany.findUnique({ where: { code: OFFICE_COMPANY_CODE } })) ??
      (await db.clientCompany.create({
        data: {
          code: OFFICE_COMPANY_CODE,
          nameAr: "دفاتر المكتب",
          entityType: "COMPANY",
          kind: "OFFICE",
          isActive: true,
        },
      }))
    );
  }
}

/**
 * استرجاع البيانات القديمة إلى شركة المكتب: كل صف دفاتر بلا شركة
 * (قبل النطاق المحاسبي) يصبح من دفاتر المكتب. يُستدعى من الترحيل v6 — idempotent.
 */
export async function backfillOfficeCompany(): Promise<void> {
  const office = await getOfficeCompany();
  const unscoped = { companyId: null };
  await db.$transaction([
    db.safe.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.party.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.product.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.stockMovement.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.fixedAsset.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.employee.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.payrollRun.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.budget.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.payment.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.journalEntry.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.invoice.updateMany({ where: unscoped, data: { companyId: office.id } }),
    db.purchase.updateMany({ where: unscoped, data: { companyId: office.id } }),
  ]);
}

/** معرف الشركة النشطة: من الكوكي إن وُجد صالحًا، وإلا دفاتر المكتب */
export async function getActiveCompanyId(): Promise<string> {
  const store = await cookies();
  const fromCookie = store.get(ACTIVE_COMPANY_COOKIE)?.value;
  if (fromCookie) {
    const c = await db.clientCompany.findUnique({ where: { id: fromCookie } });
    if (c && c.isActive) return c.id;
  }
  return (await getOfficeCompany()).id;
}

/** alias واضح للصفحات: الشركة التي تُعرض دفاترها الآن */
export const requireCompanyId = getActiveCompanyId;

/** قائمة شركات النطاق (المكتب أولًا ثم العملاء النشطون) — لمبدّل الشركات */
export async function listCompanyOptions(): Promise<CompanyOption[]> {
  const companies = await db.clientCompany.findMany({
    where: { isActive: true },
    select: { id: true, code: true, nameAr: true, kind: true },
    orderBy: [{ kind: "desc" }, { nameAr: "asc" }], // OFFICE أولًا ثم CLIENT
  });
  return companies.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.nameAr,
    kind: c.kind ?? "CLIENT",
  }));
}
