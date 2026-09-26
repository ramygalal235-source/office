import { PrismaClient } from "@prisma/client";

// نستخدم نمط globalThis لتجنب فتح اتصالات متعددة أثناء hot-reload في بيئة التطوير
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
