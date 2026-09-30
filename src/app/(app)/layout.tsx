import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOfficeBrand } from "@/lib/office-brand";
import { AppShell } from "@/components/app-shell";

// كل الصفحات داخل هذا المسار تقرأ من قاعدة البيانات عند كل طلب
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const brand = await getOfficeBrand();

  return (
    <AppShell
      user={{ name: session.name, username: session.username, role: session.role }}
      brand={brand}
    >
      {children}
    </AppShell>
  );
}
