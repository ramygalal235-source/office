import { db } from "@/lib/db";

// ===== نقطة فحص صحة التطبيق =====
// عامة (بلا جلسة) — يستخدمها غلاف الـ .exe وأي مراقبة محلية للتأكد من أن
// الخادم وقاعدة البيانات يعملان. لا تكشف بيانات، فقط حالة.
export const dynamic = "force-dynamic";

export async function GET() {
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const ok = dbOk;
  return Response.json(
    {
      ok,
      app: "dafatir-almuhasib",
      version: "1.0.0",
      db: dbOk,
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}
