## 2026-09-26 - Prevent Database Exception Details Leakage in Error Responses
**Vulnerability:** `handleDbError` in `src/lib/accounting/api.ts` returned `e.message` directly in JSON responses when Prisma database errors occurred. This exposed internal database schema details, table names, and query failures to API clients.
**Learning:** Returning unhandled exception messages from database ORMs in production API responses creates an information disclosure vulnerability.
**Prevention:** Always log full exception details on the server side and return sanitized, generic error messages to client applications.
