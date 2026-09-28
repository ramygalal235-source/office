// ===== تخزين الملفات محليًا (local-first) =====
// كل الوثائق تُحفظ على قرص الجهاز نفسه تحت db/uploads — لا سحابة ولا تخزين خارجي.
// المسار المُخزَّن في القاعدة نسبيًا من جذر المشروع حتى يعمل أي نسخه.
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "db", "uploads");

/** يحفظ الملف ويعيد مساره النسبي (مثال: db/uploads/documents/2026-09/<id>.jpg) */
export async function storeUpload(buffer: Buffer, ext: string): Promise<string> {
  const month = new Date().toISOString().slice(0, 7); // 2026-09
  const relDir = path.join("documents", month);
  await fs.mkdir(path.join(UPLOADS_DIR, relDir), { recursive: true });
  const relPath = path.join("db", "uploads", relDir, `${randomUUID()}${ext}`);
  await fs.writeFile(path.join(process.cwd(), relPath), buffer);
  return relPath;
}

/** يحوّل المسار النسبي إلى مطلق مع حماية من الخروج عن مجلد الرفع */
export function resolveUpload(relPath: string): string {
  const base = path.join(process.cwd(), "db", "uploads");
  const abs = path.resolve(process.cwd(), relPath);
  if (!abs.startsWith(base + path.sep)) throw new Error("مسار ملف خارج مجلد الرفع");
  return abs;
}

export async function readUpload(relPath: string): Promise<Buffer> {
  return fs.readFile(resolveUpload(relPath));
}

/** حذف صامت — لا نريد لفقدان الملف أن يكسر حذف الوثيقة */
export async function deleteUpload(relPath: string): Promise<void> {
  try {
    await fs.unlink(resolveUpload(relPath));
  } catch {
    // الملف غير موجود — لا مشكلة
  }
}
