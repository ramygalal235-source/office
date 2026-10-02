import { z } from "zod";
import { optEnum, optNum, optText, reqText } from "@/lib/validators";
import { PARTY_TYPES } from "@/lib/domain";

export const partySchema = z.object({
  name: reqText(200, "اسم الطرف مطلوب"),
  type: optEnum(PARTY_TYPES.map((t) => t.value), "CUSTOMER"),
  legalName: optText(200),
  taxNumber: optText(50),
  commercialReg: optText(50),
  phone: optText(30),
  email: optText(120),
  address: optText(300),
  city: optText(100),
  openingBalance: optNum(),
  balanceSide: optEnum(["DEBIT", "CREDIT"], "DEBIT"),
  creditLimit: optNum(),
  notes: optText(1000),
  isActive: z.union([z.boolean(), z.string()]).optional().transform((v) => v !== false && v !== "false"),
});
