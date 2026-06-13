import { PrismaClient } from "@prisma/client";

// Seed de DEV — fixtures partagées (FOUND-01). Crée 2 organisations (Org A, Org B) avec des
// id EXPLICITES + 1 OrgNote par org. Ces id d'org sont l'UNIQUE source canonique : ce sont les
// MÊMES que ceux que Better Auth utilisera comme activeOrganizationId (Plan 04) et que consomment
// les tests d'isolation (Plan 03) / RBAC (Plan 04). Un seul espace d'id organisation.
export const ORG_A_ID = "org-A";
export const ORG_B_ID = "org-B";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // slug requis (colonne canonique Better Auth, unique).
    await prisma.organization.upsert({
      where: { id: ORG_A_ID },
      update: {},
      create: { id: ORG_A_ID, name: "Org A", slug: "org-a" },
    });
    await prisma.organization.upsert({
      where: { id: ORG_B_ID },
      update: {},
      create: { id: ORG_B_ID, name: "Org B", slug: "org-b" },
    });

    await prisma.orgNote.create({
      data: { orgId: ORG_A_ID, body: "Note interne Org A" },
    });
    await prisma.orgNote.create({
      data: { orgId: ORG_B_ID, body: "Note interne Org B" },
    });

    console.log(`Seed OK : organizations [${ORG_A_ID}, ${ORG_B_ID}] + 1 OrgNote chacune.`);
  } finally {
    await prisma.$disconnect();
  }
}

// Exécuté seulement quand lancé directement (prisma db seed / tsx seed.ts), pas à l'import.
if (process.argv[1] && process.argv[1].includes("seed")) {
  main().catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
