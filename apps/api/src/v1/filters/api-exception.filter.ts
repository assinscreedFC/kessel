import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

// ApiExceptionFilter (API-02) — transforme les HttpException de la zone /api/v1/* en enveloppe
// { success:false, error:{ code, message } } (patterns.md / 05-CONTEXT.md format erreur uniforme).
//
// Sécurité T-5-enum : le message d'erreur pour 401 est toujours "Unauthorized" —
// aucune distinction de la cause (clé absente / invalide / révoquée).

@Catch(HttpException)
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{ status(code: number): { json(body: unknown): void } }>();
    const status = exception.getStatus();

    // Codes HTTP → codes d'erreur sémantiques (sans fuite interne).
    const codeMap: Record<number, string> = {
      [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
      [HttpStatus.FORBIDDEN]: "FORBIDDEN",
      [HttpStatus.NOT_FOUND]: "NOT_FOUND",
      [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMIT_EXCEEDED",
      [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
      [HttpStatus.UNPROCESSABLE_ENTITY]: "VALIDATION_ERROR",
    };

    const code = codeMap[status] ?? "HTTP_ERROR";
    // Pour les 401 on retourne toujours "Unauthorized" (T-5-enum — anti-énumération).
    const message =
      status === HttpStatus.UNAUTHORIZED
        ? "Unauthorized"
        : exception.message;

    response.status(status).json({
      success: false,
      error: { code, message },
    });
  }
}
