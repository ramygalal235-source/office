import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** توليد كود تسلسلي مقروء: ACC-000123 */
export function padCode(prefix: string, n: number, padding = 5) {
  return `${prefix}${String(n).padStart(padding, "0")}`;
}
