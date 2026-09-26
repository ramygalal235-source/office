import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // تفعيل استهلاك موارد النظام بالكامل
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
