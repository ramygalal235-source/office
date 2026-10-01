import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/company-context";
import { fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { closeMonth, reopenMonth, runMonthCloseChecks } from "@/lib/accounting/month-close";
import { appendEvent } from "@/lib/automation/event-log";

const nowPeriod = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

/** فحص الفترة (قراءة) — يُرجع حالة الإغلاق + نتائج كل فحص */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { year: defYear, month: defMonth } = nowPeriod();
    const year = Number(url.searchParams.get("year") ?? defYear);
    const month = Number(url.searchParams.get("month") ?? defMonth);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return fail("فترة غير صحيحة");

    const companyId = await requireCompanyId();
    const [record, checks] = await Promise.all([
      db.monthClose.findUnique({ where: { companyId_year_month: { companyId, year, month } } }),
      runMonthCloseChecks(companyId, year, month),
    ]);

    return ok({
      year,
      month,
      closed: !!record,
      closedAt: record?.closedAt ?? null,
      closedBy: record?.closedBy ?? null,
      checks,
    });
  } catch (e) {
    return handleDbError(e);
  }
}

/** إغلاق الفترة — يمرّ كل فحص الحاسم ثم يسجّل */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { year: defYear, month: defMonth } = nowPeriod();
    const year = Number(body?.year ?? defYear);
    const month = Number(body?.month ?? defMonth);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return fail("فترة غير صحيحة");

    const companyId = await requireCompanyId();
    const user = getSessionUser(req)?.username ?? "system";

    const result = await closeMonth(companyId, year, month, user);
    if (!result.skipped) {
      await appendEvent({
        action: "CLOSE",
        entity: "MonthClose",
        entityId: result.record.id,
        actorType: "human",
        actor: user,
        summary: `إغلاق الفترة ${month}/${year} — ${result.checks.length} فحصًا`,
      });
    }
    return ok({ year, month, closed: true, skipped: result.skipped });
  } catch (e) {
    if (e instanceof Error && e.message) return fail(e.message, 409);
    return handleDbError(e);
  }
}

/** إعادة فتح فترة مغلقة — admin فقط */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { year: defYear, month: defMonth } = nowPeriod();
    const year = Number(url.searchParams.get("year") ?? defYear);
    const month = Number(url.searchParams.get("month") ?? defMonth);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return fail("فترة غير صحيحة");

    const user = getSessionUser(req);
    if (!user || user.role !== "admin") return fail("إعادة الفتح تحتاج صلاحية admin", 403);

    const companyId = await requireCompanyId();
    const result = await reopenMonth(companyId, year, month);
    if (!result.skipped) {
      await appendEvent({
        action: "REOPEN",
        entity: "MonthClose",
        entityId: "",
        actorType: "human",
        actor: user.username,
        summary: `إعادة فتح الفترة ${month}/${year}`,
      });
    }
    return ok({ year, month, reopened: !result.skipped });
  } catch (e) {
    return handleDbError(e);
  }
}
