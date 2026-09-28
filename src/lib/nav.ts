// ===== خريطة التنقل الرئيسي =====
export interface NavItem {
  href: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
  /** الشاشة لم تُبنَ بعد — تظهر معطّلة بدل رابط مكسور */
  disabled?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "الرئيسية",
    items: [{ href: "/", label: "لوحة التحكم", icon: "LayoutDashboard" }],
  },
  {
    title: "ش المكتب",
    items: [
      { href: "/clients", label: "شركات العملاء", icon: "Building2" },
      { href: "/obligations", label: "الالتزامات الضريبية", icon: "CalendarClock" },
      { href: "/tasks", label: "المهام المُسندة", icon: "ListTodo" },
    ],
  },
  {
    title: "المحاسبة",
    items: [
      { href: "/accounts", disabled: true, label: "دليل الحسابات", icon: "BookOpen" },
      { href: "/parties", disabled: true, label: "العملاء والموردون", icon: "Users" },
      { href: "/invoices", disabled: true, label: "فواتير البيع", icon: "Receipt" },
      { href: "/purchases", disabled: true, label: "فواتير الشراء", icon: "ShoppingCart" },
      { href: "/safes", disabled: true, label: "الخزائن والبنوك", icon: "Wallet" },
      { href: "/payments", disabled: true, label: "التحصيل والدفع", icon: "ArrowLeftRight" },
      { href: "/journal", disabled: true, label: "قيود اليومية", icon: "ScrollText" },
    ],
  },
  {
    title: "التقارير",
    items: [{ href: "/reports", disabled: true, label: "التقارير المالية", icon: "BarChart3" }],
  },
  {
    title: "الإدارة",
    items: [{ href: "/settings", disabled: true, label: "الإعدادات", icon: "Settings", adminOnly: true }],
  },
];
