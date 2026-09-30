import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleDbError, ok, requireAdmin } from "@/lib/accounting/api";
import { getOcrSettings, isOcrAvailable, type OcrProviderId } from "@/lib/ocr/engine";

const PROVIDERS: OcrProviderId[] = ["ollama", "zai", "custom"];

async function upsertSetting(key: string, value: string, label?: string) {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value, group: "ocr", label },
  });
}

/** إعدادات الاستخراج الفعّالة (admin) */
export async function GET() {
  try {
    const settings = await getOcrSettings();
    const available = await isOcrAvailable(settings);
    return ok({ ...settings, available });
  } catch (e) {
    return handleDbError(e);
  }
}

/** حفظ إعدادات الاستخراج (admin) */
export async function PUT(req: NextRequest) {
  const admin = requireAdmin(req);
  if (!admin) return fail("صلاحية المدير مطلوبة", 403);

  const body = (await req.json().catch(() => null)) as {
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  } | null;
  if (!body) return fail("بدن الطلب غير صالح", 400);

  const provider = PROVIDERS.includes(body?.provider as OcrProviderId) ? (body.provider as OcrProviderId) : null;
  if (provider && !PROVIDERS.includes(provider)) return fail("مزود غير معروف", 400);

  try {
    if (provider) await upsertSetting("ocr.provider", provider, "مزود الاستخراج");
    if (body.model !== undefined) {
      const model = String(body.model).trim();
      if (model.length > 120) return fail("اسم النموذج: 120 حرفًا كحد أقصى", 400);
      await upsertSetting("ocr.model", model, "نموذج الاستخراج");
    }
    if (body.baseUrl !== undefined) {
      const baseUrl = String(body.baseUrl).trim().replace(/\/$/, "");
      if (baseUrl && !/^https?:\/\/.+/i.test(baseUrl)) return fail("عنوان الخادم يجب أن يبدأ بـ http:// أو https://", 400);
      const key = provider === "custom" ? "ocr.baseUrl" : `ocr.baseUrl.${provider}`;
      if (baseUrl) await upsertSetting(key, baseUrl, "عنوان خادم الاستخراج");
    }
    if (body.apiKey !== undefined) {
      const apiKey = String(body.apiKey).trim();
      if (apiKey) await upsertSetting("ocr.apiKey", apiKey, "مفتاح الاستخراج");
    }

    const effective = await getOcrSettings();
    return ok({ saved: true, effective });
  } catch (e) {
    return handleDbError(e);
  }
}
