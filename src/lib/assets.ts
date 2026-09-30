// ===== محرك الأصول الثابتة والإهلاك =====
// طريقتان: القسط الثابت (STRAIGHT_LINE) والتنقص (DECLINING على القيمة الدفترية).
// كل إهلاك شهر: قيد يومية (مدين: مصروف الإهلاك 5204 — دائن: مجمع الإهلاك 1299)
// + سجل DepreciationEntry فريد لكل فترة (idempotent — لا يُكرر الإهلاك).
import { db } from "@/lib/db";
import { round2 } from "@/lib/money";
import { postJournal, PostingError } from "@/lib/accounting/posting";
import { appendEvent } from "@/lib/automation/event-log";

export const ASSET_ACCOUNTS = {
  depreciationExpense: "5204", // مصروف إهلاك أصول ثابتة
  accumulatedDepreciation: "1299", // مجمع إهلاك الأصول الثابتة (حساب مقابلي دائن)
} as const;

export type AssetWithAccount = {
  id: string;
  code: string;
  name: string;
  cost: number;
  salvageValue: number;
  lifeYears: number;
  method: string;
  accumulatedDepreciation: number;
  status: string;
};

/** إهلاك شهر واحد حسب طريقة الأصل — بلا كتابة، للاستخدام في المعاينة والحسابات */
export function monthlyDepreciationAmount(asset: {
  cost: number;
  salvageValue: number;
  lifeYears: number;
  method: string;
  accumulatedDepreciation: number;
}): number {
  const depreciable = Math.max(0, asset.cost - asset.salvageValue);
  if (depreciable <= 0 || asset.lifeYears <= 0) return 0;
  if (asset.accumulatedDepreciation >= depreciable - 0.01) return 0;

  let amount: number;
  if (asset.method === "DECLINING") {
    // معدل التنقص = 1 - (القيمة المتبقية/التكلفة)^(1/العمر)
    const ratio = asset.cost > 0 ? Math.max(0, asset.salvageValue / asset.cost) : 0;
    const rate = 1 - Math.pow(ratio, 1 / asset.lifeYears);
    amount = (asset.cost - asset.accumulatedDepreciation) * rate;
  } else {
    amount = depreciable / asset.lifeYears / 12;
  }
  // لا يتجاوز ما تبقّى قابلًا للإهلاك
  return round2(Math.min(amount, depreciable - asset.accumulatedDepreciation));
}

/** قيمة الدفترية الحالية */
export function bookValue(asset: { cost: number; accumulatedDepreciation: number }): number {
  return round2(asset.cost - asset.accumulatedDepreciation);
}

export type DepreciateResult = {
  ok: boolean;
  skipped?: boolean;
  amount?: number;
  journalNumber?: string;
  message: string;
};

/** إهلاك أصل واحد لفترة (سنة/شهر) — آمن لإعادة التنفيذ */
export async function depreciateAsset(
  assetId: string,
  year: number,
  month: number,
  user: string = "system"
): Promise<DepreciateResult> {
  const asset = await db.fixedAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new PostingError("الأصل غير موجود");
  if (asset.status !== "ACTIVE") return { ok: false, message: "الأصل ليس نشطًا — لا يمكن إهلاكه" };

  const existing = await db.depreciationEntry.findUnique({
    where: { assetId_periodYear_periodMonth: { assetId, periodYear: year, periodMonth: month } },
  });
  if (existing) {
    return {
      ok: true,
      skipped: true,
      amount: existing.amount,
      message: `الفترة ${month}/${year} مُهلكة بالفعل (${existing.amount.toFixed(2)}) — لم يُكرر الإهلاك.`,
    };
  }

  const amount = monthlyDepreciationAmount(asset);
  if (amount <= 0) {
    return { ok: false, message: "لا يوجد إهلاك محسوب — تحقق من التكلفة والقيمة المتبقية والعمر." };
  }

  const date = new Date(year, month - 1, 15);
  const entry = await postJournal({
    date,
    description: `إهلاك ${asset.name} (${asset.code}) عن ${month}/${year}`,
    sourceType: "ASSET_DEPRECIATION",
    sourceId: assetId,
    createdBy: user,
    lines: [
      { accountCode: ASSET_ACCOUNTS.depreciationExpense, debit: amount, description: `إهلاك ${asset.name}` },
      { accountCode: ASSET_ACCOUNTS.accumulatedDepreciation, credit: amount },
    ],
  });

  const accumAfter = round2(asset.accumulatedDepreciation + amount);
  await db.$transaction([
    db.depreciationEntry.create({
      data: {
        assetId,
        periodYear: year,
        periodMonth: month,
        amount,
        accumAfter,
        date,
        journalEntryId: entry.id,
        notes: `إهلاك ${asset.method === "DECLINING" ? "متناقص" : "بالقسط الثابت"}`,
      },
    }),
    db.fixedAsset.update({
      where: { id: assetId },
      data: { accumulatedDepreciation: accumAfter },
    }),
  ]);

  await appendEvent({
    action: "DEPRECIATE",
    entity: "FixedAsset",
    entityId: assetId,
    actorType: "human",
    actor: user,
    summary: `إهلاك ${asset.name} بمبلغ ${amount.toFixed(2)} عن ${month}/${year} — قيد ${entry.number}`,
  });

  return {
    ok: true,
    amount,
    journalNumber: entry.number,
    message: `تم إهلاك ${asset.name} بمبلغ ${amount.toFixed(2)} (مجمع: ${accumAfter.toFixed(2)}) — قيد ${entry.number}.`,
  };
}

/** إهلاك كل الأصول النشطة لفترة واحدة (زر «إهلاك الشهر») */
export async function depreciateAll(
  year: number,
  month: number,
  user: string = "system"
): Promise<{ done: number; skipped: number; failed: string[] }> {
  const assets = await db.fixedAsset.findMany({ where: { status: "ACTIVE" } });
  let done = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const asset of assets) {
    try {
      const r = await depreciateAsset(asset.id, year, month, user);
      if (r.ok) r.skipped ? skipped++ : done++;
      else failed.push(`${asset.name}: ${r.message}`);
    } catch (e) {
      failed.push(`${asset.name}: ${e instanceof Error ? e.message : "خطأ"}`);
    }
  }
  return { done, skipped, failed: failed.slice(0, 5) };
}

/** إتلاف/صرف أصل — يوقف الإهلاك (حساب الربح/الخسارة على الصرف شق لاحق) */
export async function disposeAsset(assetId: string, date: Date, user: string = "system") {
  const asset = await db.fixedAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new PostingError("الأصل غير موجود");
  if (asset.status === "DISPOSED") return { ok: true, skipped: true, message: "الأصل مُصرَّف بالفعل" };

  await db.fixedAsset.update({
    where: { id: assetId },
    data: { status: "DISPOSED", disposalDate: date },
  });
  await appendEvent({
    action: "DISPOSE",
    entity: "FixedAsset",
    entityId: assetId,
    actorType: "human",
    actor: user,
    summary: `صرف الأصل ${asset.name} (${asset.code}) — القيمة الدفترية ${bookValue(asset).toFixed(2)}`,
  });
  return { ok: true, message: `تم صرف ${asset.name} — توقف الإهلاك اعتبارًا من الآن.` };
}
