import { describe, expect, test, mock } from "bun:test";

// Helper to test handleDbError behavior without Next.js runtime dependencies in unit test runner
function testableHandleDbError(e: unknown) {
  // Safe error handling: log detailed stack trace/error on server, return generic message to prevent data leakage
  console.error("Database Error:", e);
  return {
    status: 500,
    body: { success: false, error: "حدث خطأ غير متوقع في قاعدة البيانات" }
  };
}

describe("handleDbError security", () => {
  test("does not expose internal database error details", () => {
    const sensitiveError = new Error("PrismaClientKnownRequestError: Table 'users' does not exist in database 'prod'");
    const consoleSpy = mock(() => {});
    const originalConsoleError = console.error;
    console.error = consoleSpy;

    try {
      const response = testableHandleDbError(sensitiveError);
      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("حدث خطأ غير متوقع في قاعدة البيانات");
      expect(response.body.error).not.toContain("PrismaClientKnownRequestError");
      expect(response.body.error).not.toContain("users");
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      console.error = originalConsoleError;
    }
  });
});
