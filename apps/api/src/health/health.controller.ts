import { Controller, Get } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";

// GET /health — route publique (AuthGuard global désactivé via @AllowAnonymous).
// Consommée par le healthcheck Docker (FOUND-04, Plan 05). Ne touche pas la DB : liveness pur.
@Controller("health")
export class HealthController {
  @AllowAnonymous()
  @Get()
  check(): { status: "ok" } {
    return { status: "ok" };
  }
}
