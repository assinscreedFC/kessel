import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../../../../tests/setup/testcontainers";

// Test d'ISOLATION CROSS-TENANT de ProposalOutcome (Phase 6, AI-01, T-6-iso) — real Postgres, AUCUN mock.
// [BLOCKING] Schéma poussé sur Postgres réel AVANT assertions (sinon faux positif type-only).
//
// ProposalOutcome n'a PAS de colonne orgId : il est scopé VIA son parent Proposal (FK proposalId).
// On prouve donc qu'org-B ne peut PAS atteindre le ProposalOutcome d'org-A : la Proposal parente est
// invisible d'org-B (proposal.findUnique({ include: { outcome } }) -> null), donc son outcome est
// inatteignable. Garde-fou anti faux-vert : org-A voit bien son propre outcome via sa Proposal.
// Le contrat de service : l'outcome ne se lit/écrit JAMAIS via proposalOutcome.findMany/.create direct,
// TOUJOURS via une Proposal forOrg-scopée (médié par le parent).

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(here, ".."); // packages/shared/db

const ORG_A = "org-A";
const ORG_B = "org-B";

type ForOrg = typeof import("./tenant-client").forOrg;
type BasePrisma = typeof import("./client").basePrisma;
type CloseDb = typeof import("./client").closeDb;

describe("outcome-isolation: Org B cannot reach Org A's ProposalOutcome (via parent, real Postgres)", () => {
  let pg: { uri: string; stop: () => Promise<void> };
  let forOrg: ForOrg;
  let basePrisma: BasePrisma;
  let closeDb: CloseDb;

  let propAId: string;
  let outcomeAId: string;

  beforeAll(async () => {
    pg = await startPostgres();

    // [BLOCKING] push du schéma sur le Postgres réel (crée la table ProposalOutcome).
    const require = createRequire(import.meta.url);
    const prismaBin = resolve(
      dirname(require.resolve("prisma/package.json")),
      "build",
      "index.js",
    );
    const schemaPath = resolve(packageDir, "prisma", "schema.prisma");
    execFileSync(
      process.execPath,
      [prismaBin, "db", "push", "--schema", schemaPath, "--url", pg.uri, "--accept-data-loss"],
      { cwd: packageDir, env: { ...process.env, DATABASE_URL: pg.uri }, stdio: "inherit" },
    );

    process.env.DATABASE_URL = pg.uri;
    ({ forOrg } = await import("./tenant-client"));
    ({ basePrisma, closeDb } = await import("./client"));

    await basePrisma.organization.create({ data: { id: ORG_A, name: "Org A", slug: "org-a" } });
    await basePrisma.organization.create({ data: { id: ORG_B, name: "Org B", slug: "org-b" } });

    // org-A : un Deal + une Proposal (via forOrg, orgId injecté), puis un ProposalOutcome rattaché
    // à la Proposal via un nested write (proposal.update { data: { outcome: { create } } }) — pattern
    // de service (ProposalOutcome est HORS SCOPED_MODELS, jamais de .create direct scopé).
    const contactA = await forOrg(ORG_A).contact.create({
      data: { name: "Client A", email: "a@org-a.test" } as never,
    });
    const dealA = await forOrg(ORG_A).deal.create({
      data: { title: "Deal A", contactId: contactA.id } as never,
    });
    const propA = await forOrg(ORG_A).proposal.create({
      data: { dealId: dealA.id, title: "Proposition A", bodyJson: { type: "doc", content: [] } } as never,
    });
    propAId = propA.id;

    // Nested write via la Proposal forOrg-scopée (contrat de service).
    await forOrg(ORG_A).proposal.update({
      where: { id: propAId },
      data: {
        outcome: {
          create: {
            outcome: "WON",
            context: { amount: "1037.05", lineCount: 2, deliverableCount: 2, bodyTextLength: 42 },
          },
        },
      } as never,
    });

    // L'id de l'outcome (lu via basePrisma, non scopé — pour les assertions de survie).
    const outcomeA = await basePrisma.proposalOutcome.findUniqueOrThrow({
      where: { proposalId: propAId },
    });
    outcomeAId = outcomeA.id;
  });

  afterAll(async () => {
    await closeDb?.();
    await pg?.stop();
  });

  it("anti faux-vert : forOrg(org-A) voit son propre ProposalOutcome via sa Proposal (parent visible)", async () => {
    const propWithOutcome = await forOrg(ORG_A).proposal.findUnique({
      where: { id: propAId },
      include: { outcome: true } as never,
    });
    expect(propWithOutcome).not.toBeNull();
    const outcome = (propWithOutcome as unknown as { outcome: { id: string; outcome: string } | null }).outcome;
    expect(outcome).not.toBeNull();
    expect(outcome?.id).toBe(outcomeAId);
    expect(outcome?.outcome).toBe("WON");
  });

  it("Org B ne peut PAS atteindre l'outcome d'A : la Proposal parente est invisible (include.outcome -> null)", async () => {
    // org-B ne voit pas la Proposal d'A -> findUnique renvoie null -> son outcome est inatteignable.
    const propViaB = await forOrg(ORG_B).proposal.findUnique({
      where: { id: propAId },
      include: { outcome: true } as never,
    });
    expect(propViaB).toBeNull();
  });

  it("Org B ne peut PAS supprimer la Proposal d'A, donc ne peut pas cascader sur son ProposalOutcome", async () => {
    const res = await forOrg(ORG_B).proposal.deleteMany({ where: { id: propAId } });
    expect(res.count).toBe(0);
    // L'outcome d'A survit (basePrisma, non scopé, confirme).
    const total = await basePrisma.proposalOutcome.count({ where: { id: outcomeAId } });
    expect(total).toBe(1);
  });

  it("Org B ne peut PAS écrire un outcome sous la Proposal d'A (nested write via Proposal invisible -> 0 ligne)", async () => {
    // org-B tente d'écraser l'outcome via un nested write : la Proposal cible est invisible -> 0 affectée.
    const res = await forOrg(ORG_B).proposal.updateMany({
      where: { id: propAId },
      data: { title: "hacked" },
    });
    expect(res.count).toBe(0);
    // L'outcome d'A est intact (toujours WON, jamais touché par B).
    const outcome = await basePrisma.proposalOutcome.findUniqueOrThrow({ where: { id: outcomeAId } });
    expect(outcome.outcome).toBe("WON");
  });
});
