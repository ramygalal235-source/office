// ===== إقلاع الخادم: نقطة تنفيذ مرة واحدة لكل عملية خادم =====
// الترتيب مهم:
//  1) الاستعادة المعلقة أولًا — تُستبدل ملفات القاعدة قبل أي اتصال.
//  2) ضبط SQLite للعمل الآمن: WAL (بقاء ضد الأعطال) + مهلة انشغال.
//  3) ترحيل المخطط — أعمدة/فهارس جديدة تُضاف للقاعدة القديمة (مستخدمو التحديثات).
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

    try {
      const { db } = await import("@/lib/db");
      // WAL دائم (يُحفظ في رأس ملف القاعدة)، وانشغال حتى 5 ثوانٍ بدل فشل فوري
      await db.$queryRaw`PRAGMA journal_mode = WAL`;
      await db.$queryRaw`PRAGMA busy_timeout = 5000`;

      const { runSchemaMigrations } = await import("@/lib/migrations");
      const { from, to, added } = await runSchemaMigrations();
      if (added > 0) console.log(`[migrations] تحديث المخطط: ${from} → ${to} (${added} تغييرًا)`);
    } catch (e) {
      // خطأ هنا لا يسقط الإقلاع — سيظهر عند أول استخدام ويُعالَج يدويًا
      console.error("[migrations] خطأ في ترحيل المخطط:", e);
    }
  }
}
