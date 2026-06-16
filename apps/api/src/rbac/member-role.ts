import { basePrisma } from "@kessel/db";

// getMemberRole — résout le rôle d'un membre dans une org depuis la table Better Auth `member`.
//
// La table `member` est POSSÉDÉE par Better Auth (pas dans schema.prisma) — on ne peut pas
// utiliser Kysely (types non générés pour cette table) ni forOrg() (pas de SCOPED_MODELS).
// Stratégie retenue : basePrisma.$queryRaw (Open Question 2 — 05-RESEARCH).
//
// Sécurité T-5-rbac-failopen : les erreurs de lookup PROPAGENT (pas de try/catch silencieux).
// Un lookup cassé = fail closed à la couche RolesGuard (ForbiddenException).
// Cas null (pas de membership trouvé) = retourne null ; la guard interprète null comme
// "pas membre de l'org" et refuse l'accès aux writes.
export async function getMemberRole(orgId: string, userId: string): Promise<string | null> {
  const rows = await basePrisma.$queryRaw<{ role: string }[]>`
    SELECT role
    FROM   "member"
    WHERE  "organizationId" = ${orgId}
    AND    "userId"          = ${userId}
    LIMIT  1
  `;
  return rows[0]?.role ?? null;
}
