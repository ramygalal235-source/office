// يوجّه الاستيرادات إلى ملفات المصدر الفعلية:
//   "@/lib/*"        → src/lib/*   (مع استبدال db وseed-data بمحاكاة/ESM)
//   "./x" و "../x"   → يحاول إرفاق .ts و /index.ts كما يفعل مجمع Next
import { access } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

const STUBS = {
  "@/lib/db": path.join(ROOT, "scripts", "stress", "stub-db.mjs"),
  "@/lib/accounting/seed-data.json": path.join(ROOT, "scripts", "stress", "stub-seed.mjs"),
};

async function firstExisting(cands) {
  for (const cand of cands) {
    try {
      await access(cand);
      return cand;
    } catch { /* التالي */ }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) return { url: pathToFileURL(STUBS[specifier]).href, shortCircuit: true };

  if (specifier.startsWith("@/lib/")) {
    const base = path.join(ROOT, "src", "lib", specifier.slice("@/lib/".length));
    const found = await firstExisting([`${base}.ts`, path.join(base, "index.ts"), base]);
    if (!found) throw new Error(`تعذّر تحليل ${specifier}`);
    return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  // استيراد نسبي بلا امتداد داخل src — نحاول إرفاق .ts
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL);
    if (parentPath.startsWith(path.join(ROOT, "src"))) {
      const base = path.resolve(path.dirname(parentPath), specifier);
      const found = await firstExisting([`${base}.ts`, path.join(base, "index.ts")]);
      if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
