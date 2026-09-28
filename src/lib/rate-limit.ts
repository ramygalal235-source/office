// ===== تحديد محاولات الدخول =====
// النظام يعمل محليًا على جهاز المكتب، فنكتفي بذاكرة العملية.
// الحد: 5 محاولات فاشلة خلال 15 دقيقة لنفس (المستخدم + العنوان).

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Bucket = { count: number; firstAt: number };
const buckets = new Map<string, Bucket>();

// تنظيف دوري حتى لا تتضخم الذاكرة في التشغيل الطويل
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.firstAt > WINDOW_MS) buckets.delete(key);
    }
  }, WINDOW_MS);
  // لا نمنع عملية Node من الخروج بسبب المؤقت
  timer.unref?.();
}

export function clientKey(req: Request, identity: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  return `${identity}|${ip}`;
}

export function tooManyAttempts(key: string): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (Date.now() - bucket.firstAt > WINDOW_MS) {
    buckets.delete(key);
    return false;
  }
  return bucket.count >= MAX_ATTEMPTS;
}

export function registerFailure(key: string): void {
  const bucket = buckets.get(key);
  if (!bucket || Date.now() - bucket.firstAt > WINDOW_MS) {
    buckets.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  bucket.count += 1;
}

export function clearAttempts(key: string): void {
  buckets.delete(key);
}
