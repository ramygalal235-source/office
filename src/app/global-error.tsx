"use client";

// ===== حاجب الخطأ النهائي (Global Error) =====
// يُستخدم عندما يفشل layout الجذر نفسه — لذلك يحمل وسم <html> خاصًا به.
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("فشل عام في التطبيق:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Cairo, system-ui, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div style={{ textAlign: "center", padding: 32, display: "grid", gap: 16, justifyItems: "center" }}>
          <AlertTriangle style={{ width: 48, height: 48, color: "#dc2626" }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>تعذّر تشغيل التطبيق</h1>
          <p style={{ maxWidth: 420, fontSize: 14, color: "#475569", margin: 0 }}>
            فشل عام في تشغيل الواجهة. أعد فتح التطبيق، وإن تكرر المشكلة راجع ملف السجل
            <span style={{ fontFamily: "monospace", fontSize: 12 }}> server.log </span> في مجلد البيانات.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 8,
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#0d7a5f",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
