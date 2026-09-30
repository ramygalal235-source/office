import { NextRequest } from "next/server";
import { auditLog, fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import {
  getEtaSettings,
  saveEtaSettings,
  testEtaConnection,
  type EtaEnvironment,
} from "@/lib/eta/client";

function maskSecret(secret: string): string {
  if (!secret) return "";
  return secret.length > 4 ? `••••${secret.slice(-4)}` : "••••";
}

/** إعدادات الفوترة الإلكترونية — هيئة الضرائب المصرية (admin) */
export async function GET(req: NextRequest) {
  try {
    const admin = requireAdmin(req);
    if (!admin) return fail("صلاحية المدير مطلوبة", 403);
    const settings = await getEtaSettings();
    return ok({
      ...settings,
      clientSecret: maskSecret(settings.clientSecret),
      hasSecret: settings.clientSecret.length > 0,
    });
  } catch (e) {
    return handleDbError(e);
  }
}

/** حفظ إعدادات الفوترة الإلكترونية (admin) */
export async function PUT(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);

  const body = (await req.json().catch(() => null)) as {
    environment?: string;
    clientId?: string;
    clientSecret?: string;
    taxNumber?: string;
    branchId?: string;
    activityCode?: string;
    governorate?: string;
    unitType?: string;
    serviceCode?: string;
  } | null;
  if (!body) return fail("بدن الطلب غير صالح", 400);

  const patch: Record<string, string> = {};
  const str = (v: unknown, max: number) => (v === undefined ? undefined : String(v).trim().slice(0, max));
  if (body.environment !== undefined) {
    if (body.environment !== "test" && body.environment !== "prod") return fail("بيئة غير معروفة", 400);
    patch.environment = body.environment as EtaEnvironment;
  }
  const clientId = str(body.clientId, 120);
  const clientSecret = str(body.clientSecret, 200);
  const taxNumber = str(body.taxNumber, 11);
  const branchId = str(body.branchId, 10);
  const activityCode = str(body.activityCode, 10);
  const governorate = str(body.governorate, 5);
  const unitType = str(body.unitType, 5);
  const serviceCode = str(body.serviceCode, 20);

  if (taxNumber !== undefined && taxNumber !== "" && !/^\d{11}$/.test(taxNumber)) {
    return fail("الرقم الضريبي يجب أن يكون 11 رقمًا", 400);
  }

  try {
    await saveEtaSettings({
      ...(patch.environment ? { environment: patch.environment } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
      // السر المموَّه («••••…») يُرسل كما هو عند الحفظ دون تغيير
      ...(clientSecret !== undefined && !clientSecret.startsWith("•") ? { clientSecret } : {}),
      ...(taxNumber !== undefined ? { taxNumber } : {}),
      ...(branchId !== undefined ? { branchId } : {}),
      ...(activityCode !== undefined ? { activityCode } : {}),
      ...(governorate !== undefined ? { governorate } : {}),
      ...(unitType !== undefined ? { unitType } : {}),
      ...(serviceCode !== undefined ? { serviceCode } : {}),
    });
    await auditLog("UPDATE", "Setting", "eta", "تحديث إعدادات الفوترة الإلكترونية (ETA)", admin);
    const saved = await getEtaSettings();
    return ok({ ...saved, clientSecret: maskSecret(saved.clientSecret), hasSecret: saved.clientSecret.length > 0 });
  } catch (e) {
    return handleDbError(e);
  }
}

/** اختبار الاتصال بالهيئة — مصادقة client credentials (admin) */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);
  try {
    const result = await testEtaConnection();
    await auditLog("UPDATE", "Setting", "eta", `اختبار اتصال هيئة الضرائب: ${result.ok ? "نجح" : "فشل"}`, admin);
    return ok(result);
  } catch (e) {
    return handleDbError(e);
  }
}
