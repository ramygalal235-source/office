"use client";

// ===== شاشة الوثائق والاستخراج الآلي =====
// رفع → طابور → استخراج → مراجعة → اعتماد (→ مسودة مستند).
// الشاشة تلتقط أي استخرج قيد التنفيذ: كل دورة تستدعي /api/automation/tick
// ثم تعيد قراءة القائمة، فيتحرك اللوح من نفسه دون تحديث يدوي.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Cpu,
  Eye,
  FileScan,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BoardExtraction {
  id: string;
  status: string;
  provider: string;
  model: string | null;
  confidence: number;
  fields: string;
  reviewedBy: string | null;
  createdAt: string;
}

export interface BoardDocument {
  id: string;
  title: string;
  type: string;
  status: string;
  clientId: string | null;
  clientName: string | null;
  mimeType: string;
  createdAt: string;
  extraction: BoardExtraction | null;
  linked: { invoices: number; purchases: number; payments: number };
}

interface OcrField {
  key: string;
  label: string;
  value: string | number | null;
  confidence: number;
  raw: string | null;
}

interface OcrMeta {
  provider: string;
  model: string;
  baseUrl: string;
  available: boolean | null;
}

// الشكل الخام كما يرجعه /api/documents (صف Prisma) — قبل التحويل لشكل اللوح
interface RawDoc {
  id: string;
  title: string;
  type: string;
  status: string;
  clientId: string | null;
  mimeType: string;
  createdAt: string;
  client?: { id: string; nameAr: string } | null;
  extractions?: BoardExtraction[];
  _count?: { invoices: number; purchases: number; payments: number };
}

function normalizeDoc(d: RawDoc): BoardDocument {
  const ex = d.extractions?.[0] ?? null;
  return {
    id: d.id,
    title: d.title,
    type: d.type,
    status: d.status,
    clientId: d.clientId,
    clientName: d.client?.nameAr ?? null,
    mimeType: d.mimeType,
    createdAt: d.createdAt,
    extraction: ex
      ? {
          id: ex.id,
          status: ex.status,
          provider: ex.provider,
          model: ex.model,
          confidence: ex.confidence,
          fields: ex.fields,
          reviewedBy: ex.reviewedBy,
          createdAt: ex.createdAt,
        }
      : null,
    linked: {
      invoices: d._count?.invoices ?? 0,
      purchases: d._count?.purchases ?? 0,
      payments: d._count?.payments ?? 0,
    },
  };
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "info" | "muted"> = {
  UPLOADED: "secondary",
  EXTRACTING: "info",
  REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
};

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama محلي",
  zai: "Z.AI (سحابي)",
  custom: "مخصص",
};

function confidenceBadge(c: number) {
  if (c >= 0.85) return <Badge variant="success">{Math.round(c * 100)}%</Badge>;
  if (c >= 0.6) return <Badge variant="warning">{Math.round(c * 100)}%</Badge>;
  return <Badge variant="destructive">{Math.round(c * 100)}%</Badge>;
}

function parseFields(json: string): OcrField[] {
  try {
    return JSON.parse(json) as OcrField[];
  } catch {
    return [];
  }
}

export function DocumentsBoard({
  initialDocuments,
  initialClients,
  userRole,
}: {
  initialDocuments: BoardDocument[];
  initialClients: { id: string; nameAr: string }[];
  userRole: string;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState<BoardDocument[]>(initialDocuments);
  const [ocr, setOcr] = useState<OcrMeta | null>(null);

  // رفع
  const fileRef = useRef<HTMLInputElement>(null);
  const [clientId, setClientId] = useState("");
  const [docType, setDocType] = useState("OTHER");
  const [uploading, setUploading] = useState(false);

  // فلاتر
  const [fStatus, setFStatus] = useState("");
  const [fType, setFType] = useState("");
  const [q, setQ] = useState("");

  // حوار المراجعة
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewImage, setReviewImage] = useState<string>("");
  const [fields, setFields] = useState<OcrField[]>([]);
  const [reviewMeta, setReviewMeta] = useState<{ provider: string; model: string | null; failed?: boolean; empty?: boolean } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = docs.filter(
    (d) =>
      (!fStatus || d.status === fStatus) &&
      (!fType || d.type === fType) &&
      (!q || d.title.toLowerCase().includes(q.toLowerCase()) || (d.clientName ?? "").includes(q))
  );

  const hasPending = docs.some((d) => d.status === "UPLOADED" || d.status === "EXTRACTING");

  // دورة الحياة: تشغيل الطابور ثم إعادة قراءة القائمة — حتى يتحرك اللوح من نفسه
  const refresh = useCallback(async () => {
    if (hasPending) await apiFetch("/api/automation/tick", { method: "POST", silent: true });
    const res = await apiFetch<RawDoc[]>("/api/documents", { silent: true });
    if (res.ok && Array.isArray(res.data)) setDocs(res.data.map(normalizeDoc));
    if (res.meta?.ocr) setOcr(res.meta.ocr as OcrMeta);
    router.refresh();
  }, [hasPending, router]);

  useEffect(() => {
    const t = setInterval(() => {
      refresh().catch(() => {});
    }, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("اختر ملفًا أولًا");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (clientId) form.append("clientId", clientId);
      form.append("type", docType);
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? "تعذّر الرفع");
        return;
      }
      toast.success(`تم رفع «${file.name}» — سيبدأ الاستخراج آليًا`);
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch {
      toast.error("تعذّر الاتصال بالخادم");
    } finally {
      setUploading(false);
    }
  };

  const openReview = async (id: string) => {
    setReviewId(id);
    setFields([]);
    setReviewMeta(null);
    setRejectReason("");
    const res = await apiFetch<{
      id: string;
      mimeType: string;
      extractions: (BoardExtraction & { rawText: string | null })[];
    }>(`/api/documents/${id}`, { silent: true });
    if (!res.ok || !res.data) return;
    setReviewImage(`/api/documents/${id}/file`);
    const done = res.data.extractions.find((e) => e.status === "DONE") ?? res.data.extractions[0];
    if (done) {
      setFields(parseFields(done.fields));
      setReviewMeta({ provider: done.provider, model: done.model });
    } else if (res.data.extractions[0]) {
      setReviewMeta({ provider: res.data.extractions[0].provider, model: res.data.extractions[0].model, failed: true });
    } else {
      setReviewMeta({ provider: "", model: null, empty: true });
    }
  };

  const approve = async () => {
    if (!reviewId) return;
    setBusy(true);
    const res = await apiFetch<{ draft: { kind: string; number: string } | null }>(`/api/documents/${reviewId}/approve`, {
      method: "POST",
      body: JSON.stringify({ fields }),
      silent: true,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر الاعتماد");
      return;
    }
    const draft = res.data?.draft;
    const kindLabel = draft?.kind === "INVOICE" ? "فاتورة بيع" : draft?.kind === "PURCHASE" ? "مستند شراء" : draft ? "سند تحصيل" : null;
    if (draft && kindLabel) {
      toast.success(`أُعتمدت الوثيقة — أُنشئت مسودة ${kindLabel} ${draft.number}، راجعها ثم رحّلها`);
    } else {
      toast.success("أُعتمدت الوثيقة");
    }
    setReviewId(null);
    await refresh();
  };

  const reject = async () => {
    if (!reviewId) return;
    setBusy(true);
    const res = await apiFetch(`/api/documents/${reviewId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: rejectReason || undefined }),
      silent: true,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "تعذّر الرفض");
      return;
    }
    toast.success("رُفضت الوثيقة وأُرشفت");
    setReviewId(null);
    await refresh();
  };

  const reExtract = async (id: string) => {
    setBusy(true);
    const res = await apiFetch(`/api/documents/${id}/re-extract`, { method: "POST", body: JSON.stringify({}), silent: true });
    setBusy(false);
    if (res.ok) toast.success("أُضيفت إعادة الاستخراج إلى الطابور");
  };

  const remove = async (id: string, title: string) => {
    if (!window.confirm(`حذف «${title}» نهائيًا مع ملفات كل نسخها؟`)) return;
    const res = await apiFetch(`/api/documents/${id}`, { method: "DELETE", silent: true });
    if (res.ok) {
      toast.success("حُذفت الوثيقة");
      await refresh();
    } else {
      toast.error(res.error ?? "تعذّر الحذف");
    }
  };

  const setFieldValue = (key: string, value: string) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.key !== key) return f;
        if (value.trim() === "") return { ...f, value: null };
        if (["net_amount", "tax_amount", "total_amount"].includes(key)) {
          const n = Number(value.replace(/[,\s]/g, ""));
          return { ...f, value: Number.isFinite(n) ? n : value };
        }
        return { ...f, value };
      })
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* حالة محرك الاستخراج */}
      {ocr && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Cpu className="size-4" />
          <span>
            محرك الاستخراج: {PROVIDER_LABELS[ocr.provider] ?? ocr.provider} — {ocr.model} ({ocr.baseUrl})
          </span>
          {ocr.available === true && <Badge variant="success">متصل</Badge>}
          {ocr.available === false && (
            <Badge variant="warning">غير متصل — شغّل Ollama وسحب النموذج: ollama pull {ocr.model}</Badge>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-4" />
            رفع وثيقة
          </CardTitle>
          <CardDescription>
            صور JPG/PNG/WEBP أو PDF — يُحفظ الملف محليًا ويُضاف الاستخراج إلى الطابور فورًا
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>الملف</Label>
            <Input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/bmp,application/pdf"
              className="w-64"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>العميل (اختياري)</Label>
            <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? "" : v)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون</SelectItem>
                {initialClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nameAr}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>النوع (اختياري — يُكتشف آليًا إن تُرك)</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={upload} disabled={uploading}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            رفع وبدء الاستخراج
          </Button>
        </CardContent>
      </Card>

      {/* فلاتر */}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="بحث بالاسم أو العميل…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        <Select value={fStatus || "all"} onValueChange={(v) => setFStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {Object.entries(DOCUMENT_STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fType || "all"} onValueChange={(v) => setFType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            {Object.entries(DOCUMENT_TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refresh().catch(() => {})}>
          <RefreshCw className="size-4" />
          تحديث
        </Button>
      </div>

      {/* القائمة */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <FileScan className="size-8" />
              <p>لا توجد وثائق بعد — ارفع أول فاتورة لتجربة الاستخراج الآلي</p>
            </CardContent>
          </Card>
        )}
        {filtered.map((d) => (
          <Card key={d.id} className="transition-colors hover:bg-accent/30">
            <CardContent className="flex flex-wrap items-center gap-3 py-3.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                {d.status === "EXTRACTING" ? (
                  <Loader2 className="size-5 animate-spin text-primary" />
                ) : (
                  <FileScan className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{d.title}</span>
                  <Badge variant={STATUS_VARIANT[d.status] ?? "secondary"}>{DOCUMENT_STATUS_LABELS[d.status] ?? d.status}</Badge>
                  <Badge variant="muted">{DOCUMENT_TYPE_LABELS[d.type] ?? d.type}</Badge>
                  {d.extraction?.status === "DONE" && confidenceBadge(d.extraction.confidence)}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>{d.clientName ?? "بدون عميل"}</span>
                  <span>{new Date(d.createdAt).toLocaleDateString("ar-EG")}</span>
                  <span>{new Date(d.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</span>
                  {d.extraction && (
                    <span>
                      الاستخراج: {PROVIDER_LABELS[d.extraction.provider] ?? d.extraction.provider}
                      {d.extraction.model ? ` / ${d.extraction.model}` : ""}
                    </span>
                  )}
                  {(d.linked.invoices > 0 || d.linked.purchases > 0 || d.linked.payments > 0) && (
                    <span className="text-success">
                      مستندات مرتبطة: {d.linked.invoices + d.linked.purchases + d.linked.payments}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {d.status === "REVIEW" && (
                  <Button size="sm" onClick={() => openReview(d.id)}>
                    <Eye className="size-4" />
                    مراجعة واعتماد
                  </Button>
                )}
                {d.status !== "EXTRACTING" && d.status !== "APPROVED" && (
                  <Button size="sm" variant="outline" onClick={() => reExtract(d.id)} disabled={busy}>
                    <RefreshCw className="size-4" />
                    إعادة الاستخراج
                  </Button>
                )}
                {userRole === "admin" && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(d.id, d.title)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* حوار المراجعة */}
      <Dialog open={reviewId !== null} onOpenChange={(o) => !o && setReviewId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>مراجعة الاستخراج</DialogTitle>
            <DialogDescription>
              صحّح أي قيمة ثم اعتمد. الاعتماد يولّد مستندًا مسودة فقط — لا شيء يُرحَّل آليًا.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-h-64 items-center justify-center rounded-lg border bg-secondary/40 p-2">
              {reviewImage ? (
                <img src={reviewImage} alt="الوثيقة" className="max-h-[60vh] rounded object-contain" />
              ) : (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2.5">
              {reviewMeta?.empty && (
                <div className="rounded-md border border-info/40 bg-info/10 p-3 text-sm">
                  لم يُشغَّل الاستخراج بعد — أغلق الحوار ثم اضغط «إعادة الاستخراج».
                </div>
              )}
              {reviewMeta?.failed && !reviewMeta.empty && (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  <XCircle className="mb-1 size-4 text-warning" />
                  آخر محاولة استخراج فشلت. يمكنك إعادة الاستخراج أو الرفع اليدوي للبيانات لاحقًا.
                </div>
              )}
              {reviewMeta && (
                <p className="text-xs text-muted-foreground">
                  استُخرج بواسطة {PROVIDER_LABELS[reviewMeta.provider] ?? reviewMeta.provider}
                  {reviewMeta.model ? ` / ${reviewMeta.model}` : ""}
                </p>
              )}
              {fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <Label className="w-40 shrink-0 text-xs">{f.label}</Label>
                  <Input
                    value={f.value == null ? "" : String(f.value)}
                    onChange={(e) => setFieldValue(f.key, e.target.value)}
                    title={f.raw ?? undefined}
                    placeholder="—"
                  />
                  {f.value != null && confidenceBadge(f.confidence)}
                </div>
              ))}
              {fields.length === 0 && !reviewMeta?.failed && (
                <p className="text-sm text-muted-foreground">جارٍ تحميل الاستخراج…</p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <Label className="text-xs">سبب الرفض (اختياري)</Label>
                <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="مثال: صورة غير مقروءة" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="destructive" onClick={reject} disabled={busy}>
              <XCircle className="size-4" />
              رفض
            </Button>
            <Button onClick={approve} disabled={busy || fields.length === 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              اعتماد وتوليد المسودة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
