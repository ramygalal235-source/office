// يعيد مصدر البيانات الحقيقي نفسه (seed-data.json) كـ ESM
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const p = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "lib", "accounting", "seed-data.json");
export default JSON.parse(await readFile(p, "utf8"));
