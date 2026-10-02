// فحص دخان: هل تُحمَّل الوحدات الفعلية عبر المحاكاة؟
import { __reset, __stores } from "./stub-db.mjs";

const rules = await import("../../src/lib/automation/rules.ts");
__reset();
await rules.seedDefaultRules();
console.log("seeded rules:", [...__stores().automationRule.values()].length);
console.log("cronMatches */15 @10:15 →", rules.cronMatches("*/15 * * * *", new Date(2026, 0, 1, 10, 15)));
console.log("cronMatches */15 @10:10 →", rules.cronMatches("*/15 * * * *", new Date(2026, 0, 1, 10, 10)));
console.log("SMOKE OK");
