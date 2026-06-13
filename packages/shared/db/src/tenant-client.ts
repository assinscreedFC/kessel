import { basePrisma } from "./client";

// Isolation multi-tenant row-level (FOUND-01) — extension Prisma $extends.
//
// CONTRAT D'IDENTITÉ ORG (invariant central, à ne jamais affaiblir) :
//   L'`orgId` reçu par forOrg(orgId) EST, en runtime applicatif, le `session.activeOrganizationId`
//   fourni par Better Auth (Plan 04) — la source CANONIQUE de l'identité organisation.
//   Les tables métier scopées (OrgNote, Plan 02 ; futurs modèles) portent `orgId` comme FK vers
//   l'id canonique `organization.id` (= activeOrganizationId). Il n'existe donc qu'UN SEUL espace
//   d'id org : le filtre `where.orgId = orgId` ne peut JAMAIS scoper sur un org inexistant.
//   Sans cette garantie, forOrg() pourrait filtrer sur un orgId fantôme et renvoyer 0 ligne,
//   ce qui MASQUERADERAIT comme une isolation correcte (faux vert — mitigation T-1-10).
//
// L'app métier IGNORE le multi-tenancy : le scoping est central, auditable et testé ici (Pitfall 4 :
// une opération oubliée = fuite cross-tenant). On couvre donc EXPLICITEMENT chaque opération Prisma,
// et on LÈVE une erreur sur toute opération non gérée plutôt que de la laisser passer non scopée.

// Registre des modèles tenant-scoped. Seuls ces modèles voient leur `orgId` injecté.
// Organization (mappée @@map("organization") sur la table canonique Better Auth) n'est PAS scopée
// par orgId — c'est la table d'identité org elle-même. Les futurs modèles métier portant un orgId
// FK vers organization.id (CRM, propositions...) s'ajoutent ici.
const SCOPED_MODELS = new Set<string>(["OrgNote"]);

// Opérations dont le filtrage passe par `where` (lecture / mise à jour / suppression / agrégats).
const WHERE_SCOPED_OPERATIONS = new Set<string>([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withOrgWhere(args: unknown, orgId: string): UnknownRecord {
  const base = isRecord(args) ? args : {};
  const where = isRecord(base.where) ? base.where : {};
  return { ...base, where: { ...where, orgId } };
}

function withOrgData(args: unknown, orgId: string): UnknownRecord {
  const base = isRecord(args) ? args : {};
  // createMany : data est un tableau ; create : data est un objet.
  if (Array.isArray(base.data)) {
    return {
      ...base,
      data: base.data.map((row) => (isRecord(row) ? { ...row, orgId } : { orgId })),
    };
  }
  const data = isRecord(base.data) ? base.data : {};
  return { ...base, data: { ...data, orgId } };
}

function withOrgUpsert(args: unknown, orgId: string): UnknownRecord {
  const base = isRecord(args) ? args : {};
  const where = isRecord(base.where) ? base.where : {};
  const create = isRecord(base.create) ? base.create : {};
  const update = isRecord(base.update) ? base.update : {};
  return {
    ...base,
    where: { ...where, orgId },
    create: { ...create, orgId },
    update: { ...update, orgId },
  };
}

/**
 * Retourne un client Prisma scopé sur une organisation.
 *
 * @param orgId Id canonique de l'organisation (= session.activeOrganizationId Better Auth).
 *   Toute opération sur un modèle tenant-scoped (cf. SCOPED_MODELS) est automatiquement bornée
 *   à cet orgId : injection dans `where` (read/update/delete) et dans `data` (create).
 */
export function forOrg(orgId: string) {
  if (!orgId) {
    // Garde-fou : un orgId vide scoperait sur "" et fuirait/masquerait. On refuse à la frontière.
    throw new Error("forOrg(orgId): orgId is required (= session.activeOrganizationId).");
  }

  return basePrisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          // Modèles non tenant-scoped (Organization, futures tables d'identité) : pass-through.
          if (!SCOPED_MODELS.has(model)) {
            return query(args);
          }

          if (WHERE_SCOPED_OPERATIONS.has(operation)) {
            return query(withOrgWhere(args, orgId));
          }

          if (operation === "create" || operation === "createMany") {
            return query(withOrgData(args, orgId));
          }

          if (operation === "upsert") {
            return query(withOrgUpsert(args, orgId));
          }

          // Pitfall 4 : opération non couverte sur un modèle scopé = fuite potentielle.
          // On échoue bruyamment plutôt que de laisser passer une requête non scopée.
          throw new Error(
            `forOrg: unhandled Prisma operation "${operation}" on scoped model "${model}" — ` +
              "add explicit org_id scoping before using it (T-1-07).",
          );
        },
      },
    },
  });
}
