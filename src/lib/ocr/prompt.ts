// ===== برومت الاستخراج وتحليل الإجابة =====
// البرومت يطلب JSON صريحًا بمفاتيح إنجليزية (للسهولة الآلية) وقيم قد تكون عربية.
// كل حقل يحتمل { value, confidence, raw } حتى يتحقق المراجع من مصدر كل قيمة.

export const DOCUMENT_JSON_SCHEMA = `{
  "doc_type": { "value": "INVOICE", "confidence": 0.9, "raw": "النص الدال على النوع من الوثيقة" },
  "date": { "value": "2026-09-01", "confidence": 0.95, "raw": "النص الأصلي للتاريخ" },
  "document_number": { "value": "INV-1042", "confidence": 0.9, "raw": "..." },
  "party_name": { "value": "اسم الجهة", "confidence": 0.8, "raw": "..." },
  "tax_number": { "value": "123-456-789", "confidence": 0.8, "raw": "..." },
  "currency": { "value": "EGP", "confidence": 0.9, "raw": "..." },
  "net_amount": { "value": 1000, "confidence": 0.85, "raw": "..." },
  "tax_amount": { "value": 140, "confidence": 0.85, "raw": "..." },
  "total_amount": { "value": 1140, "confidence": 0.9, "raw": "..." },
  "notes": { "value": "ملاحظة مختصرة إن وُجدت", "confidence": 0.7, "raw": "..." }
}`;

export function buildExtractionPrompt(): string {
  return `أنت محرك استخراج بيانات من وثائق محاسبية مصرية. اقرأ الوثيقة المرفقة واستخرج البيانات المطلوبة بدقة.

قواعد صارمة:
1. أجب بـ JSON صالح فقط، دون أي نص قبله أو بعده، ودون علامات تنسيق.
2. المفاتيح الإنجليزية بالضبط كما في المخطط أدناه. كل حقل كائن: value (القيمة أو null)، confidence (عدد بين 0 و 1 يعبر عن ثقتك)، raw (النص الأصلي كما ظهر في الوثيقة، أو null).
3. doc_type أحد القيم: INVOICE (فاتورة بيع)، PURCHASE_INVOICE (فاتورة شراء)، RECEIPT (إيصال/سند قبض)، BANK_STATEMENT (كشف حساب بنكي)، CONTRACT (عقد)، ID (بطاقة ضريبية أو هوية)، TAX_FORM (بيان ضريبي)، OTHER (غير ذلك).
4. التاريخ بصيغة YYYY-MM-DD. إن كُتب بالتقويم الهجري أو عربيًا حوّله.
5. المبالغ أعدادًا بلا فواصل ولا وحدات (مثال: 12500.50).
6. إن لم تجد حقلًا اجعل value و raw هما null و confidence صفرًا.
7. لا تختلق أي قيمة غير واضحة في الوثيقة — الأفضل null مع ثقة منخفضة.

المخطط:
${DOCUMENT_JSON_SCHEMA}`;
}

export interface OcrField {
  key: string;
  label: string;
  value: string | number | null;
  confidence: number;
  raw: string | null;
}

export interface OcrResult {
  fields: OcrField[];
  docType: string | null;
  confidence: number;
}

const FIELD_LABELS: Record<string, string> = {
  doc_type: "نوع الوثيقة",
  date: "التاريخ",
  document_number: "رقم الوثيقة",
  party_name: "اسم الطرف",
  tax_number: "الرقم الضريبي",
  currency: "العملة",
  net_amount: "الإجمالي قبل الضريبة",
  tax_amount: "ضريبة القيمة المضافة",
  total_amount: "الإجمالي شامل الضريبة",
  notes: "ملاحظات",
};

const FIELD_ORDER = [
  "doc_type",
  "date",
  "document_number",
  "party_name",
  "tax_number",
  "currency",
  "net_amount",
  "tax_amount",
  "total_amount",
  "notes",
];

/** يستخرج أول كائن JSON متوازن من نص قد يكون محاطًا بتعليقات أو علامات تنسيق */
export function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("لا يوجد كائن JSON في إجابة النموذج");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1)) as Record<string, unknown>;
      }
    }
  }
  throw new Error("كائن JSON غير مكتمل في إجابة النموذج");
}

interface RawField {
  value?: unknown;
  confidence?: unknown;
  raw?: unknown;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[,\sج.ن.ل.م]/gu, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** يحول إجابة النموذج الصيغية إلى حقول موحّدة بأسماء عربية ومتوسط ثقة */
export function parseOcrResponse(text: string): OcrResult {
  const parsed = extractJson(text);
  const fields: OcrField[] = [];
  let docType: string | null = null;

  for (const key of FIELD_ORDER) {
    const raw = parsed[key] as RawField | null | undefined;
    let value: string | number | null = null;
    let confidence = 0;
    let rawText: string | null = null;

    if (raw && typeof raw === "object") {
      if (key === "net_amount" || key === "tax_amount" || key === "total_amount") {
        value = toNumber(raw.value);
      } else {
        value = toStr(raw.value);
      }
      const c = typeof raw.confidence === "number" ? raw.confidence : toNumber(raw.confidence);
      confidence = c == null ? (value == null ? 0 : 0.5) : Math.max(0, Math.min(1, c));
      rawText = toStr(raw.raw);
    } else if (raw != null) {
      // بعض النماذج تُرجع القيمة مباشرة بدل الكائن
      value = key === "net_amount" || key === "tax_amount" || key === "total_amount" ? toNumber(raw) : toStr(raw);
      confidence = value == null ? 0 : 0.5;
    }

    if (key === "doc_type" && typeof value === "string") docType = value.toUpperCase();

    fields.push({
      key,
      label: FIELD_LABELS[key] ?? key,
      value,
      confidence,
      raw: rawText,
    });
  }

  const withValues = fields.filter((f) => f.value != null);
  const confidence = withValues.length
    ? withValues.reduce((sum, f) => sum + f.confidence, 0) / withValues.length
    : 0;

  return { fields, docType, confidence };
}

/** قيمة حقل من قائمة الحقول الموحّدة */
export function fieldByKey(fields: OcrField[], key: string): OcrField | undefined {
  return fields.find((f) => f.key === key);
}
