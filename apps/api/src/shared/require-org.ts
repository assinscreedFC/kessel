import { BadRequestException } from "@nestjs/common";
import type { UserSession } from "@thallesp/nestjs-better-auth";
import type { auth } from "@kessel/auth";

// Extrait l'org active de la session (= source canonique Better Auth activeOrganizationId) ou rejette.
//
// DRY : réutilisé par les controllers contacts/deals — l'`orgId` est l'UNIQUE entrée du scoping ORM
// (forOrg(orgId)). Une session sans org active ne peut pas opérer sur des données scopées : on échoue
// à la frontière (400) plutôt que de laisser un orgId vide atteindre forOrg (qui lèverait de toute façon).
export function requireOrg(session: UserSession<typeof auth>): string {
  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    throw new BadRequestException("No active organization in session (activeOrganizationId missing).");
  }
  return orgId;
}
