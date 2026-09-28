import { NextRequest } from "next/server";
import { handleDbError, ok } from "@/lib/accounting/api";
import { getPartyBalances } from "@/lib/accounting/ledger";

/** أرصدة أطراف الحساب — عملاء أو موردون، محسوبة من الفواتير والسندات */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") === "SUPPLIER" ? "SUPPLIER" : "CUSTOMER";
    const balances = await getPartyBalances(type);
    return ok(balances, { type });
  } catch (e) {
    return handleDbError(e);
  }
}
