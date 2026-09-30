import Link from "next/link";
import { Compass } from "lucide-react";

// ===== 404 — صفحة «غير موجود» بالعربية =====
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
        <Compass className="size-7 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        الرابط الذي فتحتَه غير صحيح أو نُقل. تأكد من العنوان، أو عد إلى لوحة التحكم وواصل من هناك.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        العودة إلى لوحة التحكم
      </Link>
    </div>
  );
}
