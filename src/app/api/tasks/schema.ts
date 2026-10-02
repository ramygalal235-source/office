import { z } from "zod";
import { optDate, optEnum, optText, reqText } from "@/lib/validators";
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain";

export { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain";

export const taskSchema = z.object({
  title: reqText(200, "عنوان المهمة مطلوب"),
  description: optText(2000),
  companyId: optText(30),
  engagementId: optText(30),
  obligationId: optText(30),
  assignedTo: optText(30),
  priority: optEnum(TASK_PRIORITIES, "MEDIUM"),
  status: optEnum(TASK_STATUSES, "TODO"),
  category: optEnum(TASK_CATEGORIES, "GENERAL"),
  dueDate: optDate(),
  notes: optText(1000),
});
