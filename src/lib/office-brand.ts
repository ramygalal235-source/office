// ===== هوية المكتب الديناميكية =====
// الاسم والوصف يُعدَّلان من شاشة الإعدادات، ويُرجَع BRAND الثابت احتياطًا
// حتى يعمل النظام قبل أي إعداد (أو إذا تعذرت القراءة).
import { BRAND } from "@/lib/accounting/constants";
import { db } from "@/lib/db";

export interface OfficeBrand {
  name: string;
  subtitle: string;
  primary: string;
}

let cache: OfficeBrand | null = null;

export async function getOfficeBrand(): Promise<OfficeBrand> {
  if (cache) return cache;
  try {
    const rows = await db.setting.findMany({ where: { key: { in: ["office.name", "office.subtitle"] } } });
    const name = rows.find((r) => r.key === "office.name")?.value?.trim() || BRAND.name;
    const subtitle = rows.find((r) => r.key === "office.subtitle")?.value?.trim() || BRAND.subtitle;
    cache = { name, subtitle, primary: BRAND.primary };
    return cache;
  } catch {
    return { name: BRAND.name, subtitle: BRAND.subtitle, primary: BRAND.primary };
  }
}
