import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { auditLog, fail, generateNumber, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue, optEnum, optNum, optText, reqText } from "@/lib/validators";
import { SAFE_TYPES } from "@/lib/domain";
import { getSafeBalances } from "@/lib/accounting/ledger";
import { round2 } from "@/lib/money";

const safeSchema = z.object({
  name: reqText(200, "اسم الخزينة مطلوب"),
  type: optEnum(SAFE_TYPES.map((t) => t.value), "CASH"),
  accountId: optText(30),
  openingBalance: optNum(),
  bankName: optText(150),
  accountNumber: optText(50),
  iban: optText(50),
  branch: optText(120),
  currency: optText(10),
  isActive: z.union([z.boolean(), z.string()]).optional().transform((v) => v !== false && v !== "false"),
});

export async function GET() {
  try {
    const safes = await getSafeBalances();
    return ok(safes, { types: SAFE_TYPES });
  } catch (e) {
    return handleDbError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = safeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const user = getSessionUser(req);
    const code = await generateNumber("SAFE");
    const created = await db.safe.create({
      data: { ...parsed.data, code, accountId: parsed.data.accountId || null, openingBalance: round2(parsed.data.openingBalance) },
    });
    await auditLog("CREATE", "Safe", created.id, `إضافة ${created.type === "CASH" ? "خزينة" : "حساب بنكي"}: ${created.name}`, user?.username);
    return ok(created);
  } catch (e) {
    return handleDbError(e);
  }
}
