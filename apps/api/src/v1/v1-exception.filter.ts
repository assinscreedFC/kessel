import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

// V1ExceptionFilter (API-02) — transforme les HttpException de la zone /api/v1/* en enveloppe
// { success:false, error:{ code, message } } (05-CONTEXT.md format erreur uniforme).
//
// Alias de l'ApiExceptionFilter existant (apps/api/src/v1/filters/api-exception.filter.ts) —
// les deux coexistent ; les nouveaux controllers v1 (plan 03) utilisent V1ExceptionFilter.
//
// Codes HTTP → codes d'erreur sémantiques (lowercase, T-5-v1-enum) :
//   401 → "unauthorized"   (message toujours "Unauthorized" — anti-énumération)
//   403 → "forbidden"
//   404 → "not_found"
//   429 → "rate_limited"
//   400 → "bad_request"
//   422 → "validation_error"
//   *   → "error"

@Catch(HttpException)
export class V1ExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const status = exception.getStatus();

    const codeMap: Record<number, string> = {
      [HttpStatus.UNAUTHORIZED]: "unauthorized",
      [HttpStatus.FORBIDDEN]: "forbidden",
      [HttpStatus.NOT_FOUND]: "not_found",
      [HttpStatus.TOO_MANY_REQUESTS]: "rate_limited",
      [HttpStatus.BAD_REQUEST]: "bad_request",
      [HttpStatus.UNPROCESSABLE_ENTITY]: "validation_error",
    };

    const code = codeMap[status] ?? "error";
    // T-5-v1-enum : 401 retourne toujours "Unauthorized" — aucune distinction de la cause.
    const message =
      status === HttpStatus.UNAUTHORIZED ? "Unauthorized" : exception.message;

    response.status(status).json({
      success: false,
      error: { code, message },
    });
  }
}
