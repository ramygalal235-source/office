import { NextRequest } from "next/server";
import { auditLog, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { refreshBudgetActuals } from "@/lib/budgets";

type Ctx = { params: Promise<{ id: string }> };

/** تحديث الفعلي من قيود اليومية المرحَّلة */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = getSessionUser(req);
  try {
    const result = await refreshBudgetActuals(id, user?.username ?? "system");
    await auditLog("REFRESH", "Budget", id, "تحديث الفعلي للموازنة", user?.username);
    return ok(result, { ok: true });
  } catch (e) {
    return handleDbError(e);
  }
}
