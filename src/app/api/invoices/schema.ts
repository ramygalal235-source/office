import { z } from "zod";
import { INVOICE_STATUSES } from "@/lib/domain";
import { optDate, optEnum, optNum, optText, reqDate, reqText } from "@/lib/validators";

export const lineSchema = z.object({
  productId: optText(30),
  description: reqText(300, "وصف السطر مطلوب"),
  quantity: optNum(),
  unitPrice: optNum(),
  discount: optNum(),
  taxRate: optNum(),
  accountId: optText(30),
});

export const invoiceSchema = z.object({
  customerId: optText(30),
  companyId: optText(30),
  date: reqDate(),
  dueDate: optDate(),
  discount: optNum(),
  notes: optText(1000),
  status: optEnum(INVOICE_STATUSES, "DRAFT"),
  items: z.array(lineSchema).min(1, "أضف سطرًا واحدًا على الأقل"),
});

export const purchaseSchema = invoiceSchema.extend({
  supplierId: optText(30),
  status: optEnum(["DRAFT", "RECEIVED", "PARTIAL", "PAID", "CANCELLED"], "DRAFT"),
});
