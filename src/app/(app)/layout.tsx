import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

// كل الصفحات داخل هذا المسار تقرأ من قاعدة البيانات عند كل طلب
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell
      user={{ name: session.name, username: session.username, role: session.role }}
    >
      {children}
    </AppShell>
  );
}
