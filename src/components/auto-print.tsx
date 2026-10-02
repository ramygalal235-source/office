"use client";

// يفتح حوار الطباعة تلقائيًا عند فتح صفحة الطباعة
// (في المتصفح: خيار "حفظ كـ PDF" من نفس الحوار)
import { useEffect } from "react";

export function AutoPrint({ delay = 500 }: { delay?: number }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return null;
}
