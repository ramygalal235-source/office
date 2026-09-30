// ===== عميل الفوترة الإلكترونية — هيئة الضرائب المصرية (ETA) =====
// الموثقة الرسمية: https://sdk.invoicing.eta.gov.eg/
// المصادقة: OAuth2 client credentials (scope=InvoicingAPI)
// نبدأ بإصدار المستند 0.9 (التحقق من التوقيع معطّل) — الإصدار 1.0 الموقّع
// يحتاج ختم إلكتروني (eSeal) من جهة إصدار شهادات مصرية، وهو شق لاحق.
import { db } from "@/lib/db";

const HOSTS = {
  test: {
    token: "https://id.preprod.eta.gov.eg/connect/token",
    api: "https://api.preprod.invoicing.eta.gov.eg",
  },
  prod: {
    token: "https://id.eta.gov.eg/connect/token",
    api: "https://api.invoicing.eta.gov.eg",
  },
} as const;

export type EtaEnvironment = "test" | "prod";

export type EtaSettings = {
  environment: EtaEnvironment;
  clientId: string;
  clientSecret: string;
  taxNumber: string; // الرقم الضريبي للجهة المصدرة (11 رقمًا)
  branchId: string; // 0 للفروع الواحدة
  activityCode: string; // النشاط الضريبي (مثل 9478)
  governorate: string; // كود المحافظة (مثل 014 للإسكندرية)
  unitType: string; // كود وحدة القياس (001 = قطعة)
  serviceCode: string; // كود الخدمة للخدمات (اختياري)
};

export class EtaError extends Error {}

const EMPTY: Omit<EtaSettings, "environment"> = {
  clientId: "",
  clientSecret: "",
  taxNumber: "",
  branchId: "0",
  activityCode: "",
  governorate: "",
  unitType: "001",
  serviceCode: "",
};

export const ETA_SETTING_KEYS = Object.keys(EMPTY).concat(["environment"]) as (keyof EtaSettings)[];

export async function getEtaSettings(): Promise<EtaSettings> {
  const rows = await db.setting.findMany({ where: { key: { startsWith: "eta." } } });
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  return {
    environment: get("eta.environment") === "prod" ? "prod" : "test",
    clientId: get("eta.clientId"),
    clientSecret: get("eta.clientSecret"),
    taxNumber: get("eta.taxNumber"),
    branchId: get("eta.branchId") || "0",
    activityCode: get("eta.activityCode"),
    governorate: get("eta.governorate"),
    unitType: get("eta.unitType") || "001",
    serviceCode: get("eta.serviceCode"),
  };
}

const ETA_LABELS: Record<string, string> = {
  environment: "بيئة الهيئة",
  clientId: "معرف العميل (Client ID)",
  clientSecret: "سر العميل (Client Secret)",
  taxNumber: "الرقم الضريبي",
  branchId: "رقم الفرع",
  activityCode: "كود النشاط الضريبي",
  governorate: "كود المحافظة",
  unitType: "كود وحدة القياس",
  serviceCode: "كود الخدمة",
};

export async function saveEtaSettings(patch: Partial<EtaSettings>): Promise<EtaSettings> {
  await db.$transaction(
    ETA_SETTING_KEYS.map((k) => {
      const v = patch[k];
      if (v === undefined) return null;
      return db.setting.upsert({
        where: { key: `eta.${k}` },
        update: { value: String(v) },
        create: { key: `eta.${k}`, value: String(v), group: "eta", label: ETA_LABELS[k] },
      });
    }).filter(Boolean)
  );
  return getEtaSettings();
}

export function isEtaConfigured(s: EtaSettings): boolean {
  return s.clientId.length > 0 && s.clientSecret.length > 0 && /^\d{11}$/.test(s.taxNumber);
}

// ===== رمز المصادقة (يُخزَّن مؤقتًا حتى انتهاء الصلاحية) =====
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function etaToken(settings?: EtaSettings): Promise<string> {
  const s = settings ?? (await getEtaSettings());
  if (!s.clientId || !s.clientSecret) {
    throw new EtaError("لم يتم الربط بعد — أدخل بيانات العميل (Client ID/Secret) من الإعدادات ← الفوترة الإلكترونية.");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const res = await fetch(HOSTS[s.environment].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: s.clientId,
      client_secret: s.clientSecret,
      scope: "InvoicingAPI",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    cachedToken = null;
    throw new EtaError(
      `فشل المصادقة مع الهيئة (رمز ${res.status}). راجع بيانات العميل والبيئة المختارة.`
    );
  }
  const tokenData: { access_token: string; expires_in?: number } = await res.json();
  cachedToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + ((tokenData.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.token;
}

async function etaCall<T = unknown>(
  settings: EtaSettings,
  path: string,
  init?: { method?: string; body?: string }
): Promise<T> {
  const token = await etaToken(settings);
  const res = await fetch(`${HOSTS[settings.environment].api}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Accept-Language": "ar",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: init?.body,
    cache: "no-store",
  });
  if (res.status === 401) cachedToken = null;
  if (!res.ok) {
    let detail = "";
    try {
      const d = await res.json();
      detail = d.detail ?? d.message ?? JSON.stringify(d);
    } catch {
      detail = "";
    }
    throw new EtaError(`الهيئة أعدت رمز ${res.status}. ${detail}`.slice(0, 400));
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export type EtaAcceptedDoc = { uuid: string; longId: string; internalId: string };
export type EtaSubmitResult = {
  submissionUUID: string;
  accepted: EtaAcceptedDoc[];
  rejected: { internalId: string; error: string }[];
};

// ===== إرسال دفعة مستندات (JSON) — POST /api/v1.0/documentsubmissions/ =====
export async function submitDocument(
  settings: EtaSettings,
  etaDocument: Record<string, unknown>
): Promise<EtaSubmitResult> {
  const data = await etaCall<{
    submissionUUID: string;
    acceptedDocuments?: EtaAcceptedDoc[];
    rejectedDocuments?: { internalId: string; error?: string }[];
  }>(settings, "/api/v1.0/documentsubmissions/", {
    method: "POST",
    body: JSON.stringify({ documents: [etaDocument] }),
  });
  return {
    submissionUUID: data.submissionUUID,
    accepted: data.acceptedDocuments ?? [],
    rejected: (data.rejectedDocuments ?? []).map((r) => ({
      internalId: r.internalId,
      error: r.error ?? "",
    })),
  };
}

// ===== حالة الدفعة — GET /api/v1.0/submissions/{uuid} =====
export async function getSubmission(settings: EtaSettings, submissionUUID: string): Promise<unknown> {
  return etaCall(settings, `/api/v1.0/submissions/${submissionUUID}`);
}

// ===== تفاصيل المستند ونتائج التحقق — GET /api/v1.0/documents/{uuid}/details =====
export async function getDocumentDetails(settings: EtaSettings, docUuid: string): Promise<unknown> {
  return etaCall(settings, `/api/v1.0/documents/${docUuid}/details`);
}

// ===== اختبار الاتصال (يُستخدم من شاشة الإعدادات) =====
export async function testEtaConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const s = await getEtaSettings();
    if (!isEtaConfigured(s)) {
      return { ok: false, message: "أكمل بيانات العميل والرقم الضريبي (11 رقمًا) أولًا." };
    }
    await etaToken(s);
    return {
      ok: true,
      message: `تم الاتصال بنجاح — بيئة ${s.environment === "test" ? "الاختبار (preprod)" : "الإنتاج"}.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "تعذّر الاتصال بالهيئة." };
  }
}
