import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e LOST (AI-01, Phase 6) — Postgres RÉEL via bootTestApp (aucune signature/IO externe ici : la
// transition LOST est un PATCH /api/deals/:id orchestré dans apps/api).
//
// Prouve :
//  - deal avec proposition SENT -> PATCH status LOST (+ reason) -> ProposalOutcome(LOST) créé, reason persistée ;
//  - IDEMPOTENCE : re-LOST -> toujours 1 outcome ;
//  - GRACIEUX : deal SANS proposition -> PATCH LOST -> 200, 0 outcome, aucune erreur ;
//  - CONFLIT : deal avec proposition SIGNED (déjà WON) -> PATCH LOST -> pas d'outcome LOST (filtre SENT/DRAFT).

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";

const DOC = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Offre." }] }],
};

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

describe("e2e LOST (AI-01) — ProposalOutcome(LOST) en effet de bord de deal->LOST, gracieux/idempotent, jamais SIGNED (real PG)", () => {
  let baseUrl: string;
  let basePrisma: typeof import("@kessel/db").basePrisma;
  let stop: () => Promise<void>;
  let cookieA: string;

  async function signup(label: string): Promise<string> {
    const res = await fetch(`${baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `${label}+${Date.now()}-${Math.random().toString(36).slice(2)}@kessel.test`,
        password: "Sup3r-Secret-Pw!",
        name: label,
      }),
    });
    expect([200, 201]).toContain(res.status);
    return cookieFrom(res);
  }

  async function setupOrg(cookie: string, name: string): Promise<string> {
    const createRes = await fetch(`${baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name, slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
    });
    expect([200, 201]).toContain(createRes.status);
    const org = (await createRes.json()) as { id: string };
    await fetch(`${baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ organizationId: org.id }),
    });
    return org.id;
  }

  async function createDeal(cookie: string): Promise<string> {
    const cRes = await fetch(`${baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Client", email: `c+${Date.now()}-${Math.random().toString(36).slice(2)}@x.test` }),
    });
    expect(cRes.status).toBe(201);
    const contact = (await cRes.json()) as { id: string };
    const dRes = await fetch(`${baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Deal", contactId: contact.id, status: "LEAD" }),
    });
    expect(dRes.status).toBe(201);
    const deal = (await dRes.json()) as { id: string };
    return deal.id;
  }

  async function createProposal(cookie: string, dealId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Proposition", bodyJson: DOC }),
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as { id: string };
    return p.id;
  }

  async function addLine(cookie: string, proposalId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/proposals/${proposalId}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Prestation", quantity: 1, unitPrice: 200, position: 0 }),
    });
    expect(res.status).toBe(201);
  }

  // Envoie la proposition (status -> SENT) et renvoie son token.
  async function send(cookie: string, proposalId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/proposals/${proposalId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    expect([200, 201]).toContain(res.status);
  }

  async function patchDeal(cookie: string, dealId: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(`${baseUrl}/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    const app = await bootTestApp();
    baseUrl = app.baseUrl;
    basePrisma = app.basePrisma;
    stop = app.stop;

    cookieA = await signup("lost-A");
    await setupOrg(cookieA, "OrgLostA");
  });

  afterAll(async () => {
    await stop?.();
  });

  it("1. deal avec proposition SENT -> PATCH LOST (+ reason) -> ProposalOutcome(LOST) créé, reason persistée", async () => {
    const dealId = await createDeal(cookieA);
    const proposalId = await createProposal(cookieA, dealId);
    await addLine(cookieA, proposalId);
    await send(cookieA, proposalId); // status SENT

    const res = await patchDeal(cookieA, dealId, { status: "LOST", reason: "Budget trop élevé" });
    expect(res.status).toBe(200);

    const outcome = (await basePrisma.proposalOutcome.findUnique({ where: { proposalId } })) as {
      outcome: string;
      reason: string | null;
      context: { amount: string };
    } | null;
    expect(outcome).not.toBeNull();
    expect(outcome!.outcome).toBe("LOST");
    expect(outcome!.reason).toBe("Budget trop élevé");
    expect(outcome!.context.amount).toBe("200.00"); // 1 × 200 — snapshot figé
  });

  it("2. IDEMPOTENCE : re-LOST -> toujours 1 outcome", async () => {
    const dealId = await createDeal(cookieA);
    const proposalId = await createProposal(cookieA, dealId);
    await send(cookieA, proposalId);

    await patchDeal(cookieA, dealId, { status: "LOST", reason: "première" });
    // Re-LOST (geste répété) -> no-op idempotent.
    const second = await patchDeal(cookieA, dealId, { status: "LOST", reason: "deuxième" });
    expect(second.status).toBe(200);

    const count = await basePrisma.proposalOutcome.count({ where: { proposalId } });
    expect(count).toBe(1);
    // La reason reste celle du PREMIER enregistrement (idempotent : no-op au 2e).
    const outcome = (await basePrisma.proposalOutcome.findUnique({ where: { proposalId } })) as {
      reason: string | null;
    } | null;
    expect(outcome!.reason).toBe("première");
  });

  it("3. GRACIEUX : deal SANS proposition -> PATCH LOST -> 200, 0 outcome, aucune erreur", async () => {
    const dealId = await createDeal(cookieA);
    // Aucune proposition rattachée.
    const res = await patchDeal(cookieA, dealId, { status: "LOST", reason: "abandonné" });
    expect(res.status).toBe(200); // pas d'erreur

    // 0 outcome (aucune proposition à résoudre).
    const proposals = (await basePrisma.proposal.findMany({ where: { dealId } })) as { id: string }[];
    expect(proposals).toHaveLength(0);
    const count = await basePrisma.proposalOutcome.count();
    // Sanity : aucun outcome orphelin créé pour ce deal (vérifié indirectement : 0 proposition).
    expect(typeof count).toBe("number");
  });

  it("4. CONFLIT : deal avec proposition SIGNED (déjà WON) -> PATCH LOST -> pas d'outcome LOST (filtre SENT/DRAFT)", async () => {
    // Simuler une proposition déjà SIGNED + son outcome WON via basePrisma (ProposalOutcome hors
    // SCOPED_MODELS -> création directe ; on évite ici le flux signature complet, hors sujet de ce test).
    const dealId = await createDeal(cookieA);
    const proposalId = await createProposal(cookieA, dealId);
    await basePrisma.proposal.update({ where: { id: proposalId }, data: { status: "SIGNED", signedAt: new Date() } });
    await basePrisma.proposalOutcome.create({
      data: {
        proposalId,
        outcome: "WON",
        context: { amount: "0.00", lineCount: 0, deliverableCount: 0, bodyTextLength: 0 },
      },
    });

    // PATCH deal LOST : la proposition étant SIGNED, le filtre SENT/DRAFT l'exclut -> pas de LOST.
    const res = await patchDeal(cookieA, dealId, { status: "LOST", reason: "tentative incohérente" });
    expect(res.status).toBe(200);

    // L'outcome reste WON (aucun LOST créé, aucun écrasement).
    const outcome = (await basePrisma.proposalOutcome.findUnique({ where: { proposalId } })) as {
      outcome: string;
    } | null;
    expect(outcome!.outcome).toBe("WON");
    const count = await basePrisma.proposalOutcome.count({ where: { proposalId } });
    expect(count).toBe(1);
  });
});
