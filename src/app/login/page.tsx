import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { BRAND } from "@/lib/accounting/constants";
import { LoginForm } from "./login-form";

export const metadata = { title: "تسجيل الدخول | دفاتر المحاسب" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div
            className="flex size-14 items-center justify-center rounded-2xl text-2xl font-bold text-primary-foreground shadow-sm"
            style={{ backgroundColor: BRAND.primary }}
          >
            د
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">{BRAND.name}</h1>
            <p className="text-sm text-muted-foreground">{BRAND.subtitle}</p>
          </div>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
