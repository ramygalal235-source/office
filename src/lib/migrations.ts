// ===== ترحيل مخطط قاعدة البيانات عند الإقلاع (للمستخدمين الحاليين) =====
// المشكلة: مستخدم الـ .exe يحتفظ بقاعدة بياناته عبر تحديثات التطبيق. عند إضافة
// حقول جديدة للمخطط، تبقى القاعدة القديمة بلاها فيفشل الاستعلام الجديد
// («no such column»). هنا كل ترحيل: خطوات SQL صغيرة آمنة على SQLite
// (ADD COLUMN بلا بيانات + فهارس IF NOT EXISTS) تُطبَّق فقط عند نقصها.
//
// القاعدة: كل ترحيل مُرقَّم، فاحص وجوده يسبق تطبيقه، والتطبيق كله idempotent —
// أي إعادة إقلاع لا تُكرر شيئًا. لا نستخدم prisma migrate لأن الحزمة
// النهائية بلا اتصال ولا ملف migrات — فقط المخطط الحالي.
import { db } from "@/lib/db";
import { backfillOfficeCompany } from "@/lib/company-context";

type ColumnChange = { table: string; column: string; sql: string };
type IndexChange = { table: string; name: string; columns: string[]; unique?: boolean };

type Migration = {
  version: number; // يترصد في PRAGMA user_version
  columns: ColumnChange[];
  indexes: IndexChange[];
  dropIndexes?: { name: string }[]; // فهارس تُسقط إن وُجدت (تغيير تقييد)
  sql?: string[]; // إعلانات SQL إضافية (CREATE TABLE IF NOT EXISTS...) — تُنفَّذ عند تطبيق الإصدار
  seed?: () => Promise<void>; // خطوة بيانات idempotent عند تطبيق الإصدار
  note: string;
};

const MIGRATIONS: Migration[] = [
  {
    // الإصدار 2: حقول الفوترة الإلكترونية (هيئة الضرائب ETA) على Invoice
    version: 2,
    note: "حقول ETA على Invoice",
    columns: [
      { table: "Invoice", column: "etaStatus", sql: "etaStatus TEXT" },
      { table: "Invoice", column: "etaDocUuid", sql: "etaDocUuid TEXT" },
      { table: "Invoice", column: "etaSubmission", sql: "etaSubmission TEXT" },
      { table: "Invoice", column: "etaStatusAt", sql: "etaStatusAt DATETIME" },
      { table: "Invoice", column: "etaError", sql: "etaError TEXT" },
    ],
    indexes: [{ table: "Invoice", name: "Invoice_etaStatus_idx", columns: ["etaStatus"] }],
  },
  {
    // الإصدار 3: تتبع صرف الرواتب
    version: 3,
    note: "paidAt على PayrollRun",
    columns: [{ table: "PayrollRun", column: "paidAt", sql: "paidAt DATETIME" }],
    indexes: [],
  },
  {
    // الإصدار 4: تتبع ترحيل قيد الاستحواذ للأصول
    version: 4,
    note: "acquisitionPosted على FixedAsset",
    columns: [{ table: "FixedAsset", column: "acquisitionPosted", sql: "acquisitionPosted BOOLEAN DEFAULT 0" }],
    indexes: [],
  },
  {
    // الإصدار 5: قيمة البيع عند صرف الأصل (للقيد المحاسبي)
    version: 5,
    note: "disposalProceeds على FixedAsset",
    columns: [{ table: "FixedAsset", column: "disposalProceeds", sql: "disposalProceeds FLOAT" }],
    indexes: [],
  },
  {
    // الإصدار 6: النطاق المحاسبي لكل شركة — دفاتر مستقلة لكل شركة عميل + المكتب
    // نضيف companyId على نماذج الدفاتر، ونسقط فهرس فريدة الرواتب (سنة/شهر)
    // ونستبدله بـ (شركة/سنة/شهر) حتى تشتغل كل شركة بشهرها مستقلة.
    version: 6,
    note: "النطاق المحاسبي لكل شركة (companyId) + دفاتر المكتب",
    columns: [
      { table: "ClientCompany", column: "kind", sql: "kind TEXT DEFAULT 'CLIENT'" },
      { table: "Safe", column: "companyId", sql: "companyId TEXT" },
      { table: "Party", column: "companyId", sql: "companyId TEXT" },
      { table: "Product", column: "companyId", sql: "companyId TEXT" },
      { table: "StockMovement", column: "companyId", sql: "companyId TEXT" },
      { table: "FixedAsset", column: "companyId", sql: "companyId TEXT" },
      { table: "Employee", column: "companyId", sql: "companyId TEXT" },
      { table: "PayrollRun", column: "companyId", sql: "companyId TEXT" },
      { table: "Budget", column: "companyId", sql: "companyId TEXT" },
      { table: "Payment", column: "companyId", sql: "companyId TEXT" },
    ],
    dropIndexes: [{ name: "PayrollRun_periodYear_periodMonth_unique" }],
    indexes: [
      { table: "Safe", name: "Safe_companyId_idx", columns: ["companyId"] },
      { table: "Party", name: "Party_companyId_idx", columns: ["companyId"] },
      { table: "Product", name: "Product_companyId_idx", columns: ["companyId"] },
      { table: "StockMovement", name: "StockMovement_companyId_idx", columns: ["companyId"] },
      { table: "FixedAsset", name: "FixedAsset_companyId_idx", columns: ["companyId"] },
      { table: "Employee", name: "Employee_companyId_idx", columns: ["companyId"] },
      { table: "PayrollRun", name: "PayrollRun_companyId_idx", columns: ["companyId"] },
      { table: "Budget", name: "Budget_companyId_idx", columns: ["companyId"] },
      { table: "Payment", name: "Payment_companyId_idx", columns: ["companyId"] },
      { table: "PayrollRun", name: "PayrollRun_companyId_periodYear_periodMonth_unique", columns: ["companyId", "periodYear", "periodMonth"] },
    ],
    seed: backfillOfficeCompany,
  },
  {
    // الإصدار 7: مساهمة صاحب العمل على القسيمة (لبيان التأمينات) + جدول مطابقة البنك
    version: 7,
    note: "employerInsurance على Payslip + جدول BankTransaction",
    columns: [{ table: "Payslip", column: "employerInsurance", sql: "employerInsurance FLOAT DEFAULT 0" }],
    indexes: [
      { table: "BankTransaction", name: "BankTransaction_safeId_date_idx", columns: ["safeId", "date"] },
      { table: "BankTransaction", name: "BankTransaction_companyId_idx", columns: ["companyId"] },
      { table: "BankTransaction", name: "BankTransaction_status_idx", columns: ["status"] },
    ],
    sql: [
      `CREATE TABLE IF NOT EXISTS "BankTransaction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "safeId" TEXT NOT NULL,
        "date" DATETIME NOT NULL,
        "reference" TEXT,
        "description" TEXT,
        "amount" FLOAT NOT NULL,
        "direction" TEXT NOT NULL DEFAULT 'IN',
        "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
        "matchedPaymentId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BankTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ClientCompany" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "BankTransaction_safeId_fkey" FOREIGN KEY ("safeId") REFERENCES "Safe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "BankTransaction_matchedPaymentId_fkey" FOREIGN KEY ("matchedPaymentId") REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )`,
    ],
  },
  {
    // الإصدار 8: إغلاق الشهر (MonthClose) + الفواتير المتكررة (RecurringInvoice)
    version: 8,
    note: "جدولا MonthClose و RecurringInvoice + ربط Invoice.recurringId",
    columns: [{ table: "Invoice", column: "recurringId", sql: "recurringId TEXT" }],
    indexes: [
      { table: "Invoice", name: "Invoice_recurringId_idx", columns: ["recurringId"] },
      { table: "MonthClose", name: "MonthClose_companyId_year_month_unique", columns: ["companyId", "year", "month"], unique: true },
      { table: "MonthClose", name: "MonthClose_companyId_idx", columns: ["companyId"] },
      { table: "RecurringInvoice", name: "RecurringInvoice_companyId_active_idx", columns: ["companyId", "active"] },
      { table: "RecurringInvoice", name: "RecurringInvoice_nextDueDate_idx", columns: ["nextDueDate"] },
    ],
    sql: [
      `CREATE TABLE IF NOT EXISTS "MonthClose" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT NOT NULL,
        "year" INTEGER NOT NULL,
        "month" INTEGER NOT NULL,
        "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "closedBy" TEXT NOT NULL,
        "checks" TEXT NOT NULL,
        CONSTRAINT "MonthClose_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ClientCompany" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "RecurringInvoice" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "companyId" TEXT,
        "name" TEXT NOT NULL,
        "customerId" TEXT,
        "amount" FLOAT NOT NULL,
        "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
        "notes" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "nextDueDate" DATETIME NOT NULL,
        "lastGeneratedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "RecurringInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "ClientCompany" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "RecurringInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )`,
    ],
  },
  {
    // الإصدار 9: تصحيح EventLog.seq — autoincrement لا يُقبل على حقل غير id في SQLite
    // (يُسلسل برمجيا داخل transaction). إن وُجد العمود من نسخة قديمة يُتجاهل.
    version: 9,
    note: "EventLog.seq INTEGER DEFAULT 0 (تصحيح autoincrement غير المدعوم)",
    columns: [{ table: "EventLog", column: "seq", sql: "seq INTEGER DEFAULT 0" }],
    indexes: [],
  },
];

const LATEST_VERSION = MIGRATIONS.reduce((m, x) => Math.max(m, x.version), 1);

async function tableColumns(table: string): Promise<Set<string>> {
  const rows = (await db.$queryRaw({
    sql: `SELECT name FROM pragma_table_info('${table}')`,
  })) as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

async function indexExists(indexName: string): Promise<boolean> {
  const rows = (await db.$queryRaw({
    sql: `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ${JSON.stringify(indexName)}`,
  })) as { name: string }[];
  return rows.length > 0;
}

/**
 * يُستدعى مرة واحدة عند إقلاع الخادم (بعد الاستعادة المعلقة).
 * يعيد الأرقام: [الإصدار قبل، الإصدار بعد، عدد الأعمدة المضافة].
 */
export async function runSchemaMigrations(): Promise<{ from: number; to: number; added: number }> {
  const [versionRows] = await Promise.all([
    db.$queryRaw<{ user_version: number }[]>`PRAGMA user_version`,
  ]);
  const current = versionRows?.[0]?.user_version ?? 0;
  if (current >= LATEST_VERSION && current > 0) {
    // قاعدة جديدة (من db push) أو محدثة بالفعل — نتأكد من الإصدار المسجل فقط
    return { from: current, to: current, added: 0 };
  }

  let added = 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;

    for (const change of migration.columns) {
      const cols = await tableColumns(change.table);
      if (cols.has(change.column)) continue;
      await db.$queryRaw({
        sql: `ALTER TABLE ${change.table} ADD COLUMN ${change.sql}`,
      });
      added += 1;
    }

    for (const drop of migration.dropIndexes ?? []) {
      if (!(await indexExists(drop.name))) continue;
      await db.$queryRaw({ sql: `DROP INDEX ${drop.name}` });
      added += 1;
    }

    // الجداول الجديدة أولًا (CREATE TABLE IF NOT EXISTS) ثم الفهارس فوقها
    for (const stmt of migration.sql ?? []) {
      await db.$queryRaw({ sql: stmt });
      added += 1;
    }

    for (const idx of migration.indexes) {
      if (await indexExists(idx.name)) continue;
      const unique = idx.unique ?? idx.name.endsWith("_unique") ? "UNIQUE " : "";
      await db.$queryRaw({
        sql: `CREATE ${unique}INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${idx.columns.join(", ")})`,
      });
      added += 1;
    }

    if (migration.seed) {
      await migration.seed();
    }
  }

  await db.$queryRaw({ sql: `PRAGMA user_version = ${LATEST_VERSION}` });
  return { from: current, to: LATEST_VERSION, added };
}
