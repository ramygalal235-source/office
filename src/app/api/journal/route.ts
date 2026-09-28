import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { PostingError, postJournal } from "@/lib/accounting/posting";
import { JOURNAL_STATUSES } from "@/lib/domain";
import { round2 } from "@/lib/money";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const status = url.searchParams.get("status") ?? "";
    const sourceType = url.searchParams.get("sourceType") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();

    const where = {
      ...(status ? { status } : {}),
      ...(sourceType ? { sourceType } : {}),
      ...(q ? { OR: [{ number: { contains: q } }, { description: { contains: q } }] } : {}),
    };

    const [items, total, sums] = await Promise.all([
      db.journalEntry.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: [{ date: "desc" }, { number: "desc" }],
        skip,
        take,
      }),
      db.journalEntry.count({ where }),
      db.journalEntry.aggregate({ where, _sum: { totalDebit: true, totalCredit: true } }),
    ]);

    return ok(items, {
      page, limit, total, pages: Math.ceil(total / limit),
      totals: sums._sum, statuses: JOURNAL_STATUSES,
    });
  } catch (e) {
    return handleDbError(e);
  }
}

/** قيد يدوي — يُستخدم في القيود التي لا تنشأ من مستند (تسويات، مصروفات) */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      date?: string;
      description?: string;
      lines?: { accountId?: string; debit?: number; credit?: number; description?: string }[];
    } | null;

    if (!body?.description?.trim()) return fail("بيان القيد مطلوب", 400);
    if (!Array.isArray(body.lines) || body.lines.length < 2)
      return fail("القيد يحتاج طرفين على الأقل (مدين ودائن)", 400);

    const accounts = await db.account.findMany({
      where: { id: { in: body.lines.map((l) => l.accountId ?? "").filter(Boolean) } },
      select: { id: true, code: true },
    });
    const codeById = new Map(accounts.map((a) => [a.id, a.code]));

    const lines = body.lines.map((l) => {
      const code = l.accountId ? codeById.get(l.accountId) : undefined;
      if (!code) throw new PostingError("أحد الحسابات المحددة غير موجود");
      return {
        accountCode: code,
        debit: round2(l.debit ?? 0),
        credit: round2(l.credit ?? 0),
        description: l.description ?? body.description,
      };
    });

    const user = getSessionUser(req);
    const entry = await postJournal({
      date: body.date ? new Date(body.date) : new Date(),
      description: body.description.trim(),
      sourceType: "MANUAL",
      sourceId: "",
      createdBy: user?.username ?? "system",
      lines,
    });

    await auditLog("CREATE", "JournalEntry", entry.id, `قيد يدوي ${entry.number}`, user?.username);
    return ok(entry);
  } catch (e) {
    if (e instanceof PostingError) return fail(e.message, 400);
    return handleDbError(e);
  }
}
