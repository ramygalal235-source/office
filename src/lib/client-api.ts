"use client";

import { toast } from "sonner";

export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
}

/** نداء موحّد للواجهة: يرجع النتيجة بدل رمي استثناء، ويعرض رسالة الخطأ */
export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit & { successMessage?: string; silent?: boolean } = {}
): Promise<ApiResult<T>> {
  const { successMessage, silent, ...init } = options;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.success) {
      const error = json?.error || "تعذّر تنفيذ العملية";
      if (!silent) toast.error(error);
      return { ok: false, error, status: res.status };
    }

    if (successMessage) toast.success(successMessage);
    return { ok: true, data: json.data as T, status: res.status };
  } catch {
    const error = "تعذّر الاتصال بالخادم";
    if (!silent) toast.error(error);
    return { ok: false, error, status: 0 };
  }
}

export function jsonBody(data: unknown): RequestInit {
  return { body: JSON.stringify(data) };
}
