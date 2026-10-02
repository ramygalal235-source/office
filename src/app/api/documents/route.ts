import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { auditLog, fail, getSessionUser, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { enqueue } from "@/lib/automation/queue";
import { record } from "@/lib/automation/event-log";
import { storeUpload } from "@/lib/storage";
import { ocrStatus } from "@/lib/ocr";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const status = url.searchParams.get("status") ?? "";
    const type = url.searchParams.get("type") ?? "";
    const clientId = url.searchParams.get("clientId") ?? "";
    const q = (url.searchParams.get("q") ?? "").trim();

    const where = {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(clientId ? { clientId } : {}),
      ...(q ? { title: { contains: q } } : {}),
    };

    const [items, total] = await Promise.all([
      db.dmsDocument.findMany({
        where,
        include: {
          client: { select: { id: true, nameAr: true } },
          extractions: { orderBy: { createdAt: "desc" }, take: 1 },
          _count: { select: { invoices: true, purchases: true, payments: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.dmsDocument.count({ where }),
    ]);

    return ok(items, {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      ocr: await ocrStatus(),
    });
  } catch (e) {
    return handleDbError(e);
  }
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/bmp",
  "application/pdf",
  "text/plain",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

export async function POST(req: NextRequest) {
  try {
    const user = getSessionUser(req);
    const form = await req.formData().catch(() => null);
    if (!form) return fail("استلام البيانات فشل — أرسل multipart/form-data");

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("الملف مطلوب");
    if (file.size > 25 * 1024 * 1024) return fail("حجم الملف يتجاوز 25 ميغابايت");
    if (!ALLOWED_MIME.has(file.type)) return fail("الصيغ المدعومة: صورة JPG/PNG/WEBP/BMP أو PDF أو نص");

    const buffer = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(buffer).digest("hex");

    const duplicate = await db.dmsDocument.findUnique({ where: { checksum } });
    if (duplicate) {
      return fail(`نسخة مطابقة تمامًا مرفوعة من قبل: «${duplicate.title}»`, 409);
    }

    const storagePath = await storeUpload(buffer, EXT_BY_MIME[file.type] ?? ".bin");
    const baseName = (file.name ?? "وثيقة").replace(/\.[^.]+$/, "");
    const type = String(form.get("type") ?? "OTHER");
    const title = String(form.get("title") ?? "") || baseName;

    const doc = await db.dmsDocument.create({
      data: {
        clientId: String(form.get("clientId") ?? "") || null,
        engagementId: String(form.get("engagementId") ?? "") || null,
        type,
        title,
        status: "UPLOADED",
        checksum,
        storagePath,
        mimeType: file.type,
        size: file.size,
        uploadedBy: user?.username ?? null,
        source: "upload",
      },
    });

    await db.dmsDocumentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storagePath,
        checksum,
        note: "النسخة الأصلية",
        createdBy: user?.username ?? null,
      },
    });

    const { job, created } = await enqueue({
      type: "document.extract",
      payload: { documentId: doc.id },
      idempotencyKey: `extract:${doc.id}:v1`,
      priority: 80,
    });

    await record({
      action: "document.uploaded",
      entity: "DmsDocument",
      entityId: doc.id,
      actorType: "human",
      actor: user?.username ?? "unknown",
      summary: `رفع وثيقة: ${title}`,
      payload: { version: 1, checksum: checksum.slice(0, 12), jobId: job.id, jobCreated: created },
    });
    await auditLog("CREATE", "DmsDocument", doc.id, `رفع وثيقة ${title}`, user?.username);

    return ok({ document: doc, job: { id: job.id, created } });
  } catch (e) {
    return handleDbError(e);
  }
}
