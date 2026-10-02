import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleDbError } from "@/lib/accounting/api";
import { readUpload } from "@/lib/storage";

const INLINE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp"]);

/** يعيد ملف نسخة من الوثيقة لعرضها في شاشة المراجعة */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const version = Number(req.nextUrl.searchParams.get("version") ?? 0) || undefined;

    const doc = await db.dmsDocument.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: "desc" }, ...(version ? { where: { version } } : {}) } },
    });
    if (!doc) return fail("الوثيقة غير موجودة", 404);
    const v = doc.versions[0];
    if (!v) return fail("لا توجد نسخة محفوظة", 404);

    const buf = await readUpload(v.storagePath);
    const inline = INLINE_MIME.has(doc.mimeType);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(buf.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="document-${v.version}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleDbError(e);
  }
}
