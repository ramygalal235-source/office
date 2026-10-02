import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOfficeBrand } from "@/lib/office-brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "تسجيل الدخول | دفاتر المحاسب" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/");

  const brand = await getOfficeBrand();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div
            className="flex size-14 items-center justify-center rounded-2xl text-2xl font-bold text-primary-foreground shadow-sm"
            style={{ backgroundColor: brand.primary }}
          >
            {brand.name.slice(0, 1)}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">{brand.name}</h1>
            <p className="text-sm text-muted-foreground">{brand.subtitle}</p>
          </div>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
