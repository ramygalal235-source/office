import { z } from "zod";
import { optEnum, optText, reqText } from "@/lib/validators";

// مخطط شركة العميل — يُستخدم في الإضافة والتعديل معًا

const ENTITY_TYPES = [
  "COMPANY",
  "INDIVIDUAL",
  "PARTNERSHIP",
  "LLC",
  "SAE",
  "NONPROFIT",
  "BRANCH",
] as const;

const LEGAL_FORMS = [
  "INDIVIDUAL",
  "SOLIDARITY",
  "SIMPLE_PARTNERSHIP",
  "LLC",
  "SAE",
  "NONPROFIT",
] as const;

export const companySchema = z.object({
  nameAr: reqText(200, "اسم الشركة مطلوب"),
  nameEn: optText(200),
  code: optText(30),
  entityType: optEnum(ENTITY_TYPES, "COMPANY"),
  legalForm: optEnum(LEGAL_FORMS, "INDIVIDUAL"),
  activity: optText(200),
  taxNumber: optText(50),
  taxFileNumber: optText(50),
  taxOffice: optText(120),
  vatRegistrationNumber: optText(50),
  vatOffice: optText(120),
  commercialRegNumber: optText(50),
  socialInsuranceNumber: optText(50),
  phone: optText(30),
  email: optText(120),
  address: optText(300),
  city: optText(100),
  ownerName: optText(150),
  ownerNationalId: optText(30),
  ownerPhone: optText(30),
  contactPerson: optText(150),
  contactPhone: optText(30),
  notes: optText(1000),
  isActive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => v !== false && v !== "false"),
});
