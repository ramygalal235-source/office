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
      { href: "/documents", label: "الوثائق والاستخراج", icon: "FileScan" },
      { href: "/engagements", label: "ملفات العمل", icon: "Briefcase" },
    ],
  },
  {
    title: "المحاسبة",
    items: [
      { href: "/accounts", label: "دليل الحسابات", icon: "BookOpen" },
      { href: "/parties", disabled: true, label: "العملاء والموردون", icon: "Users" },
      { href: "/invoices", label: "فواتير البيع", icon: "Receipt" },
      { href: "/purchases", label: "فواتير الشراء", icon: "ShoppingCart" },
      { href: "/safes", disabled: true, label: "الخزائن والبنوك", icon: "Wallet" },
      { href: "/payments", disabled: true, label: "التحصيل والدفع", icon: "ArrowLeftRight" },
      { href: "/journal", label: "قيود اليومية", icon: "ScrollText" },
    ],
  },
  {
    title: "التقارير",
    items: [{ href: "/reports", label: "التقارير المالية", icon: "BarChart3" }],
  },
  {
    title: "الإدارة",
    items: [{ href: "/settings", disabled: true, label: "الإعدادات", icon: "Settings", adminOnly: true }],
  },
];
