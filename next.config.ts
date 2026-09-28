import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // تفعيل استهلاك موارد النظام بالكامل
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // مخرجات مستقلة (standalone) لتشغيل البرنامج داخل غلاف .exe —
  // انظر launcher/electron و scripts/package-standalone.mjs
  output: "standalone",
};

export default nextConfig;
