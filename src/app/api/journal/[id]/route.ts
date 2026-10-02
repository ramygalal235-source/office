import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleDbError, ok } from "@/lib/accounting/api";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const entry = await db.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          orderBy: { sortOrder: "asc" },
          include: { account: { select: { id: true, code: true, name: true, type: true } } },
        },
      },
    });
    if (!entry) return fail("القيد غير موجود", 404);

    const totalDebit = entry.lines.reduce((a, l) => a + l.debit, 0);
    const totalCredit = entry.lines.reduce((a, l) => a + l.credit, 0);

    return ok({ ...entry, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
  } catch (e) {
    return handleDbError(e);
  }
}
