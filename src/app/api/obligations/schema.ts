import { z } from "zod";
import { optEnum, optNum, optText, reqDate, reqText } from "@/lib/validators";
import { OBLIGATION_STATUSES, OBLIGATION_TYPES } from "@/lib/domain";

export { OBLIGATION_STATUSES, OBLIGATION_TYPES, OBLIGATION_TYPE_LABELS } from "@/lib/domain";

export const obligationSchema = z.object({
  companyId: reqText(30, "اختر شركة العميل"),
  type: optEnum(OBLIGATION_TYPES, "OTHER"),
  title: reqText(200, "عنوان الالتزام مطلوب"),
  period: reqText(30, "الفترة مطلوبة"),
  periodYear: optNum(),
  periodMonth: optNum(),
  periodQuarter: optNum(),
  dueDate: reqDate(),
  amountDue: optNum(),
  amountPaid: optNum(),
  status: optEnum(OBLIGATION_STATUSES, "PENDING"),
  referenceNumber: optText(60),
  notes: optText(1000),
});

