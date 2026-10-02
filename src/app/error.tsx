"use client";

// ===== حاجب الأخطاء العام (Client Boundary) =====
// أي خطأ في شجرة المكونات تحت الجذر يسقط هنا بدل شاشة متصفح فارغة.
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // يُسجَّل في سجل خادم التطبيق (server.log في الحزمة)
    console.error("صفحة فشلت في العرض:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="size-7 text-destructive" />
      </div>
      <h1 className="text-2xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        لم تُفقد بياناتك — الأخطاء هنا في عرض الصفحة فقط. أعد تحميلها، وإن تكرر المشكلة فعُد إلى
        لوحة التحكم.
      </p>
      <p className="text-xs text-muted-foreground" dir="ltr">
        {error.digest ? `مرجع الخطأ: ${error.digest}` : ""}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          إعادة المحاولة
        </button>
        <a
          href="/"
          className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
        >
          لوحة التحكم
        </a>
      </div>
    </div>
  );
}
