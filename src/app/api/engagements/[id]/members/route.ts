import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok } from "@/lib/accounting/api";
import { firstIssue } from "@/lib/validators";
import { z } from "zod";

const bodySchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["LEAD", "REVIEWER", "MEMBER"]).default("MEMBER"),
  allocationPct: z.number().min(0).max(100).default(0),
});

/** إضافة عضو لملف عمل — إن كان موجودًا بالفعل تُحدَّث بياناته */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const engagement = await db.engagement.findUnique({ where: { id } });
    if (!engagement) return fail("ملف العمل غير موجود", 404);

    const member = await db.engagementMember.upsert({
      where: { engagementId_userId: { engagementId: id, userId: parsed.data.userId } },
      update: { role: parsed.data.role, allocationPct: parsed.data.allocationPct },
      create: {
        engagementId: id,
        userId: parsed.data.userId,
        role: parsed.data.role,
        allocationPct: parsed.data.allocationPct,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    await auditLog("UPDATE", "Engagement", id, `إسناد ${member.user.name} لملف ${engagement.code} بدور ${parsed.data.role}`, user?.username);
    return ok({ member });
  } catch (e) {
    return handleDbError(e);
  }
}

/** إزالة عضو من ملف العمل */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = getSessionUser(req);
    const { id } = await params;
    const userId = req.nextUrl.searchParams.get("userId") ?? "";
    if (!userId) return fail("userId مطلوب");

    const engagement = await db.engagement.findUnique({ where: { id } });
    if (!engagement) return fail("ملف العمل غير موجود", 404);

    const removed = await db.engagementMember.deleteMany({
      where: { engagementId: id, userId },
    });
    if (removed.count === 0) return fail("العضو غير مسند لهذا الملف", 404);

    await auditLog("UPDATE", "Engagement", id, `إزالة عضو من ملف ${engagement.code}`, user?.username);
    return ok({ removed: removed.count });
  } catch (e) {
    return handleDbError(e);
  }
}
