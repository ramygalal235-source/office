import { NextRequest } from "next/server";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { PostingError, postPayment } from "@/lib/accounting/posting";

type Ctx = { params: Promise<{ id: string }> };

/** ترحيل سند القبض أو الصرف إلى قيود اليومية */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = getSessionUser(req);
    const entry = await postPayment(id, user?.username ?? "system");
    await auditLog("POST", "Payment", id, `ترحيل ${entry.description}`, user?.username);
    return ok(entry, { entryNumber: entry.number });
  } catch (e) {
    if (e instanceof PostingError) return fail(e.message, 400);
    return handleDbError(e);
  }
}
