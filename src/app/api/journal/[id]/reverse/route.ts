import { NextRequest } from "next/server";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { PostingError, reverseJournalEntry } from "@/lib/accounting/posting";

type Ctx = { params: Promise<{ id: string }> };

/** عكس قيد: لا نحذف القيود أبدًا، بل ننشئ قيدًا عكسيًا في تاريخ اليوم */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = getSessionUser(req);
    const entry = await reverseJournalEntry(id, user?.username ?? "system");
    await auditLog("REVERSE", "JournalEntry", id, `عكس القيد ${entry.number}`, user?.username);
    return ok(entry);
  } catch (e) {
    if (e instanceof PostingError) return fail(e.message, 400);
    return handleDbError(e);
  }
}
