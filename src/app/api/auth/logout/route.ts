import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { auditLog, getSessionUser, ok } from "@/lib/accounting/api";

export async function POST(req: NextRequest) {
  const user = getSessionUser(req);
  if (user) {
    await auditLog("LOGOUT", "User", user.uid, "تسجيل خروج", user.username);
  }

  const res: NextResponse = ok({ loggedOut: true }) as NextResponse;
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
