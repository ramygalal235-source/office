import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // تفعيل استهلاك موارد النظام بالكامل
  typescript: {
    ignoreBuildErrors: true,
  },
  // مخرجات مستقلة (standalone) لتشغيل البرنامج داخل غلاف .exe —
  // انظر launcher/electron و scripts/package-standalone.mjs
  // (خيار eslint.ignoreDuringBuilds أُزيل في Next 16 — البناء لا يفحص lint أصلًا)
  output: "standalone",
  // ===== رؤوس أمان على كل الاستجابات =====
  // (بلا CSP: النظام يعتمد أنماطًا مضمّنة في رسوم الطباعة والرسوم البيانية)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
