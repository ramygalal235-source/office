// ===== إقلاع الخادم: نقطة تنفيذ مرة واحدة لكل عملية خادم =====
// تُطبَّق الاستعادة المعلقة (إن وُجدت) قبل خدمة أي طلب.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { applyPendingRestore } = await import("@/lib/backup");
      const result = await applyPendingRestore();
      if (result.applied) console.log("[backup] تمت استعادة نسخة احتياطية معلقة");
      else if (result.reason) console.warn("[backup] الاستعادة المعلقة لم تُطبَّق:", result.reason);
    } catch (e) {
      // لا نمنع إقلاع النظام بسبب خطأ في الاستعادة
      console.error("[backup] خطأ في فحص الاستعادة المعلقة:", e);
    }
  }
}
