import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

// Guard RÉUTILISABLE (T-1-authz / V4 Access Control). Distinct de requireOrg() (400) : ici 401, car
// l'absence d'org active = requête non autorisée à atteindre une ressource scopée. À placer via
// @UseGuards(OrgScopeGuard) sur les controllers nécessitant une org active. La session est attachée
// par @thallesp/nestjs-better-auth (AuthGuard global) sur request.session (A3).
@Injectable()
export class OrgScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const activeOrganizationId = request?.session?.session?.activeOrganizationId;
    if (!activeOrganizationId) {
      throw new UnauthorizedException(
        "No active organization — set an active organization before calling this endpoint.",
      );
    }
    return true;
  }
}
