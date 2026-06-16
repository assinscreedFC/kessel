import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { getMemberRole } from "./member-role";

// Interface interne pour les propriétés injectées sur la requête NestJS.
interface BetterAuthRequest {
  session?: {
    session?: { activeOrganizationId?: string };
    user?: { id?: string };
  };
  method?: string;
}

// Méthodes HTTP qui modifient des données — soumises au contrôle viewer.
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// RolesGuard (API-06) — implémente le rôle `viewer` (lecture seule) pour les sessions dashboard.
//
// Logique :
//  1. Pas de session BA sur la requête (routes /api/v1/*, /portal/*, /api/public/*) → exempt, return true.
//     Ces routes sont protégées par ApiKeyGuard / ClientPortalGuard — pas par le rôle dashboard.
//  2. Méthode de lecture (GET, HEAD, OPTIONS) → toujours autorisé, return true.
//  3. orgId ou userId manquant sur une write → ForbiddenException (fail closed T-5-rbac-failopen).
//  4. Lookup role dans la table Better Auth `member` — les erreurs propagent (fail closed).
//  5. role === 'viewer' sur une write → ForbiddenException 403 (T-5-viewer-escalation).
//  6. owner / member / admin sur n'importe quelle méthode → return true (inchangé).
@Injectable()
export class RolesGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<BetterAuthRequest>();

    // Règle 1 : routes sans session Better Auth (API-key / portail / public) — exempt.
    if (!req.session) {
      return true;
    }

    const method = (req.method ?? "GET").toUpperCase();

    // Règle 2 : lectures toujours autorisées — pas de lookup DB nécessaire.
    const isWrite = WRITE_METHODS.has(method);
    if (!isWrite) {
      return true;
    }

    // Règle 3 : write sans contexte org — fail closed.
    const orgId = req.session?.session?.activeOrganizationId;
    const userId = req.session?.user?.id;
    if (!orgId || !userId) {
      throw new ForbiddenException();
    }

    // Règle 4 + 5 : lookup rôle — erreurs propagent (fail closed).
    const role = await getMemberRole(orgId, userId);
    if (role === "viewer") {
      throw new ForbiddenException();
    }

    // Règle 6 : owner / member / admin (ou tout autre rôle non-viewer) — autorisé.
    return true;
  }
}
