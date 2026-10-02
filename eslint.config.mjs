import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * إعداد ESLint (flat config — eslint 9)
 * الاستخدام: npm run lint
 *
 * ملاحظة Next 16:
 *  - الاستيراد من "eslint-config-next/core-web-vitals" (مسار ./flat أُزيل).
 *  - أمر next lint وحل lint أثناء البناء أُزيحا — البناء لا يفحص lint،
 *    والتحقق النوعي أثناء البناء يبقى مفعّلًا عبر typescript.ignoreBuildErrors.
 */
const eslintConfig = [...nextCoreWebVitals];

export default eslintConfig;
