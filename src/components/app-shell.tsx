"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Banknote,
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  CalendarClock,
  FileScan,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Package,
  PanelRightClose,
  PanelRightOpen,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Sun,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { NAV } from "@/lib/nav";
import { BRAND } from "@/lib/accounting/constants";
import { ROLE_LABELS } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Boxes,
  UserRound,
  Banknote,
  Target,
  Briefcase,
  Building2,
  CalendarClock,
  FileScan,
  ListTodo,
  BookOpen,
  Users,
  Receipt,
  ShoppingCart,
  Wallet,
  ArrowLeftRight,
  ScrollText,
  BarChart3,
  Package,
  Settings,
};

export function AppShell({
  user,
  brand,
  children,
}: {
  user: { name: string; username: string; role: string };
  /** هوية المكتب الديناميكية (تُعدَّل من الإعدادات) مع BRAND احتياطًا */
  brand?: { name: string; subtitle: string; primary: string };
  children: React.ReactNode;
}) {
  const b = brand ?? BRAND;
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("تم تسجيل الخروج");
    router.replace("/login");
    router.refresh();
  }

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.adminOnly || user.role === "admin"),
  })).filter((g) => g.items.length > 0);

  const sidebar = (
    <aside
      className={cn(
        "flex h-full flex-col border-e border-sidebar-border bg-sidebar transition-[width] duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-4">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-primary-foreground"
          style={{ backgroundColor: b.primary }}
        >
          د
        </div>
        {!collapsed && (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-bold">{b.name}</span>
            <span className="truncate text-[11px] text-muted-foreground">{b.subtitle}</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {groups.map((group) => (
          <div key={group.title} className="mb-3">
            {!collapsed && (
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon] ?? LayoutDashboard;
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const base = cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                );

                if (item.disabled) {
                  return (
                    <li key={item.href}>
                      <span
                        className={cn(base, "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-muted-foreground")}
                        title="قريبًا — لم تُبنَ هذه الشاشة بعد"
                      >
                        <Icon className="size-4 shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="truncate">{item.label}</span>
                            <span className="ms-auto text-[10px]">قريبًا</span>
                          </>
                        )}
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={collapsed ? item.label : undefined}
                      className={base}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-11 shrink-0 items-center justify-center gap-2 border-t border-sidebar-border text-xs text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
      >
        {collapsed ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
        {!collapsed && <span>طيّ القائمة</span>}
      </button>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      {/* سطح المكتب */}
      <div className="hidden shrink-0 lg:block">{sidebar}</div>

      {/* الجوال */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 start-0">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-card px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu />
          </Button>

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="تبديل المظهر"
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {user.name?.trim()?.[0] ?? "؟"}
                  </span>
                  <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{user.name}</span>
                  <span className="font-normal text-muted-foreground">
                    {user.username} • {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <UserRound />
                    الملف الشخصي والإعدادات
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={logout}>
                  <LogOut />
                  تسجيل الخروج
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
