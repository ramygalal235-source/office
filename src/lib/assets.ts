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

/** ترحيل قيد الاستحواذ: مدين حساب الأصل — دائن حساب الخزينة/البنك الممول */
export async function postAssetAcquisition(assetId: string, safeId: string, user: string = "system") {
  const asset = await db.fixedAsset.findUnique({
    where: { id: assetId },
    include: { account: { select: { code: true, name: true } } },
  });
  if (!asset) throw new PostingError("الأصل غير موجود");
  if (asset.acquisitionPosted) return { ok: true, skipped: true, message: "قيد الاستحواذ مرحّل بالفعل" };
  if (!asset.account) {
    throw new PostingError("الأصل غير مرتبط بحساب في دليل الحسابات — اختره من شاشة الأصول أولًا");
  }

  const safe = await db.safe.findUnique({ where: { id: safeId } });
  if (!safe) throw new PostingError("الخزينة/البنك غير موجود");
  if (!safe.accountId) throw new PostingError("الخزينة غير مرتبطة بحساب — اربطها من شاشة الخزائن");
  const safeAccount = await db.account.findUnique({ where: { id: safe.accountId } });

  const entry = await postJournal({
    date: asset.acquisitionDate,
    description: `استحواذ أصل ثابت: ${asset.name} (${asset.code}) من ${safe.name}`,
    sourceType: "ASSET_ACQUISITION",
    sourceId: assetId,
    createdBy: user,
    lines: [
      { accountCode: asset.account.code, debit: asset.cost, description: asset.name },
      { accountCode: safeAccount!.code, credit: asset.cost },
    ],
  });

  await db.fixedAsset.update({ where: { id: assetId }, data: { acquisitionPosted: true } });
  await appendEvent({
    action: "POST",
    entity: "FixedAsset",
    entityId: assetId,
    actorType: "human",
    actor: user,
    summary: `ترحيل قيد استحواذ ${asset.name} بمبلغ ${asset.cost.toFixed(2)} من ${safe.name} — قيد ${entry.number}`,
  });
  return { ok: true, journalNumber: entry.number, message: `أُرحل قيد الاستحواذ (${entry.number}) — الأصل الآن في القوائم المالية.` };
}

/**
 * إتلاف/صرف أصل مع قيده المحاسبي:
 *  مدين: مجمع الإهلاك (بإجماليه) + الخزينة/البنك (بقيمة البيع إن وجدت) + الربح/الخسارة
 *  دائن: حساب الأصل (بتكلفته)
 * الربح → 4201 إيرادات أخرى، الخسارة → 5299 مصروفات أخرى.
 */
export async function disposeAsset(
  assetId: string,
  options: { date?: Date; proceeds?: number; safeId?: string } = {},
  user: string = "system"
) {
  const asset = await db.fixedAsset.findUnique({
    where: { id: assetId },
    include: { account: { select: { code: true, name: true } } },
  });
  if (!asset) throw new PostingError("الأصل غير موجود");
  if (asset.status === "DISPOSED") return { ok: true, skipped: true, message: "الأصل مُصرَّف بالفعل" };

  const date = options.date ?? new Date();
  const proceeds = Math.max(0, Number(options.proceeds) || 0);

  // حساب الربح/الخسارة على القيمة الدفترية
  const book = bookValue(asset);
  const gain = round2(proceeds - book); // موجب = ربح، سالب = خسارة

  if (proceeds > 0) {
    const safe = await db.safe.findUnique({ where: { id: options.safeId ?? "" } });
    if (!safe) throw new PostingError("قيمة بيع مذكورة — حدد الخزينة/البنك الذي دخلت إليه");
    if (!safe.accountId) throw new PostingError("الخزينة غير مرتبطة بحساب — اربطها من شاشة الخزائن");
    const safeAccount = await db.account.findUnique({ where: { id: safe.accountId } });
    if (!asset.account) throw new PostingError("الأصل غير مرتبط بحساب — لا يمكن قيده");

    const lines = [
      { accountCode: ASSET_ACCOUNTS.accumulatedDepreciation, debit: asset.accumulatedDepreciation },
      { accountCode: safeAccount!.code, debit: proceeds, description: `بيع ${asset.name}` },
      { accountCode: asset.account.code, credit: asset.cost },
    ];
    if (Math.abs(gain) > 0.005) {
      lines.push(
        gain > 0
          ? { accountCode: "4201", credit: gain, description: `ربح على بيع ${asset.name}` }
          : { accountCode: "5299", debit: -gain, description: `خسارة على بيع ${asset.name}` }
      );
    }
    const entry = await postJournal({
      date,
      description: `صرف أصل: ${asset.name} (${asset.code}) — بيع بـ ${proceeds.toFixed(2)}`,
      sourceType: "ASSET_DISPOSAL",
      sourceId: assetId,
      createdBy: user,
      lines,
    });
    await db.fixedAsset.update({
      where: { id: assetId },
      data: { status: "DISPOSED", disposalDate: date, disposalProceeds: proceeds },
    });
    await appendEvent({
      action: "DISPOSE",
      entity: "FixedAsset",
      entityId: assetId,
      actorType: "human",
      actor: user,
      summary: `بيع الأصل ${asset.name} بـ ${proceeds.toFixed(2)} — ${gain >= 0 ? "ربح" : "خسارة"} ${Math.abs(gain).toFixed(2)} — قيد ${entry.number}`,
    });
    return {
      ok: true,
      message: `أُصدِر ${asset.name} — ${gain >= 0 ? "ربح" : "خسارة"} ${Math.abs(gain).toFixed(2)} على القيمة الدفترية (قيد ${entry.number}).`,
    };
  }

  // إتلاف بلا بيع: القيمة الدفترية كلها خسارة
  if (asset.account) {
    const lines = [
      { accountCode: ASSET_ACCOUNTS.accumulatedDepreciation, debit: asset.accumulatedDepreciation },
      { accountCode: asset.account.code, credit: asset.cost },
    ];
    if (book > 0.005) {
      lines.push({ accountCode: "5299", debit: book, description: `إتلاف ${asset.name}` });
    }
    const entry = await postJournal({
      date,
      description: `إتلاف أصل: ${asset.name} (${asset.code}) — خسارة ${book.toFixed(2)}`,
      sourceType: "ASSET_DISPOSAL",
      sourceId: assetId,
      createdBy: user,
      lines,
    });
    await db.fixedAsset.update({
      where: { id: assetId },
      data: { status: "DISPOSED", disposalDate: date, disposalProceeds: 0 },
    });
    await appendEvent({
      action: "DISPOSE",
      entity: "FixedAsset",
      entityId: assetId,
      actorType: "human",
      actor: user,
      summary: `إتلاف الأصل ${asset.name} — خسارة ${book.toFixed(2)} — قيد ${entry.number}`,
    });
    return { ok: true, message: `أُتلف ${asset.name} وخُرجت قيمته الدفترية (${book.toFixed(2)}) كمصروف (قيد ${entry.number}).` };
  }

  // أصل بلا حساب: صرف إداري فقط (لا قيد)
  await db.fixedAsset.update({
    where: { id: assetId },
    data: { status: "DISPOSED", disposalDate: date, disposalProceeds: 0 },
  });
  await appendEvent({
    action: "DISPOSE",
    entity: "FixedAsset",
    entityId: assetId,
    actorType: "human",
    actor: user,
    summary: `صرف إداري للأصل ${asset.name} (${asset.code}) — بلا قيد (غير مرتبط بحساب)`,
  });
  return { ok: true, message: `تم صرف ${asset.name} إداريًا — توقف الإهلاك (بلا قيد لأنه غير مرتبط بحساب).` };
}
