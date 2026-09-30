import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOfficeBrand } from "@/lib/office-brand";
import { getEtaSettings } from "@/lib/eta/client";
import { getOcrSettings, isOcrAvailable } from "@/lib/ocr/engine";
import { queueStats } from "@/lib/automation/queue";
import { verifyChain } from "@/lib/automation/event-log";
import { SettingsBoard } from "@/components/settings-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "الإعدادات | دفاتر المحاسب" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/");

  const [brand, ocr, etaRaw, stats, chain, counts, lastBackup, users] = await Promise.all([
    getOfficeBrand(),
    (async () => {
      const s = await getOcrSettings();
      return { ...s, available: await isOcrAvailable(s) };
    })(),
    getEtaSettings(),
    queueStats(),
    verifyChain(1000),
    (async () => {
      const [events, jobs, docs, invoices, companies, users] = await Promise.all([
        db.eventLog.count(),
        db.job.count(),
        db.dmsDocument.count(),
        db.invoice.count(),
        db.clientCompany.count(),
        db.user.count(),
      ]);
      return { events, jobs, docs, invoices, companies, users };
    })(),
    db.setting.findUnique({ where: { key: "backup.lastAt" } }),
    db.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsBoard
        brand={brand}
        ocr={ocr}
        eta={{
          ...etaRaw,
          clientSecret: etaRaw.clientSecret ? (etaRaw.clientSecret.length > 4 ? `••••${etaRaw.clientSecret.slice(-4)}` : "••••") : "",
          hasSecret: etaRaw.clientSecret.length > 0,
        }}
        stats={stats}
        chain={{ ok: chain.ok, checked: chain.checked, breaks: chain.breaks.length }}
        counts={counts}
        lastBackupAt={lastBackup?.value ?? null}
        initialUsers={users.map((u) => ({ ...u, lastLogin: u.lastLogin?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }))}
      />
    </div>
  );
}
