import { NextRequest } from "next/server";
import { fail, getSessionUser, ok } from "@/lib/accounting/api";

export async function GET(req: NextRequest) {
  const user = getSessionUser(req);
  if (!user) return fail("لا توجد جلسة صالحة", 401);
  return ok({ user });
}
