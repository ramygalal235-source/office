import { NextRequest } from "next/server";
import { handleDbError, ok } from "@/lib/accounting/api";
import { getPartyBalances } from "@/lib/accounting/ledger";
import { requireCompanyId } from "@/lib/company-context";

/** أرصدة أطراف الحساب — عملاء أو موردون، محسوبة من الفواتير والسندات */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") === "SUPPLIER" ? "SUPPLIER" : "CUSTOMER";
    const companyId = await requireCompanyId();
    const balances = await getPartyBalances(type, companyId);
    return ok(balances, { type });
  } catch (e) {
    return handleDbError(e);
  }
}
