import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { auditLog, fail, generateNumber, handleDbError, ok, parsePagination } from "@/lib/accounting/api";
import { computePayslip, getPayrollParams } from "@/lib/payroll";

/** قائمة الموظفين */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const { page, limit, skip, take } = parsePagination(url);
    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where: { isActive: url.searchParams.get("inactive") ? false : undefined },
        orderBy: { code: "asc" },
        skip,
        take,
      }),
      db.employee.count(),
    ]);
    return ok(employees, { page, limit, total, pages: Math.ceil(total / limit) });
  } catch (e) {
    return handleDbError(e);
  }
}

/** إنشاء موظف */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      name?: string;
      jobTitle?: string;
      department?: string;
      nationalId?: string;
      phone?: string;
      email?: string;
      hireDate?: string;
      basicSalary?: number;
      housingAllowance?: number;
      transportAllowance?: number;
      otherAllowance?: number;
      insuranceNumber?: string;
      bankName?: string;
      bankAccount?: string;
      notes?: string;
    } | null;
    if (!body?.name) return fail("اسم الموظف مطلوب", 400);

    const code = await generateNumber("EMPLOYEE");
    const emp = await db.employee.create({
      data: {
        code,
        name: body.name,
        jobTitle: body.jobTitle ?? null,
        department: body.department ?? null,
        nationalId: body.nationalId ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        hireDate: body.hireDate ? new Date(body.hireDate) : new Date(),
        basicSalary: body.basicSalary ?? 0,
        housingAllowance: body.housingAllowance ?? 0,
        transportAllowance: body.transportAllowance ?? 0,
        otherAllowance: body.otherAllowance ?? 0,
        insuranceNumber: body.insuranceNumber ?? null,
        bankName: body.bankName ?? null,
        bankAccount: body.bankAccount ?? null,
        notes: body.notes ?? null,
      },
    });
    await auditLog("CREATE", "Employee", emp.id, `إنشاء موظف: ${emp.name} (${code})`);
    return ok(emp);
  } catch (e) {
    return handleDbError(e);
  }
}
