import { flatConfig } from "eslint-config-next/flat";

/**
 * إعداد ESLint (flat config — eslint 9)
 * الاستخدام: npm run lint
 * ملاحظة: يُفعَّل فحص البناء (eslint.ignoreDuringBuilds: false) بعد أول
 * جولة npm run lint + npm run typecheck نظيفتين — انظر next.config.ts
 */
const eslintConfig = [...flatConfig];

export default eslintConfig;
