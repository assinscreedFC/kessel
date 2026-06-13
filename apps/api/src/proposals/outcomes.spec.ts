import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e DATASET (AI-01 critère 2, Phase 6) — GET /api/outcomes forOrg read-only sur Postgres RÉEL.
//
// Prouve :
//  - org A voit ses outcomes (WON + LOST) avec leur context ;
//  - ISOLATION : org B ne voit AUCUN outcome d'org A (forOrg via parent Proposal) ;
//  - NO-PII : le context exposé par l'API contient EXACTEMENT les clés whitelist, aucune clé name/email.

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";

const DOC = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Corps." }] }],
};

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

interface OutcomeDtoShape {
  proposalId: string;
  proposalTitle: string;
  outcome: string;
  decidedAt: string;
  reason: string | null;
  context: Record<string, unknown>;
}

describe("e2e GET /api/outcomes (AI-01) — dataset forOrg read-only, isolation cross-org, no-PII (real PG)", () => {
  let baseUrl: string;
  let stop: () => Promise<void>;
  let cookieA: string;
  let cookieB: string;

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

  async function createProposal(cookie: string, dealId: string, title: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title, bodyJson: DOC }),
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as { id: string };
    return p.id;
  }

  async function send(cookie: string, proposalId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/proposals/${proposalId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    expect([200, 201]).toContain(res.status);
  }

  // Crée un deal + proposition SENT puis le passe à LOST -> produit un ProposalOutcome(LOST).
  async function lostOutcome(cookie: string, title: string): Promise<string> {
    const dealId = await createDeal(cookie);
    const proposalId = await createProposal(cookie, dealId, title);
    await send(cookie, proposalId);
    const res = await fetch(`${baseUrl}/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ status: "LOST", reason: "raison" }),
    });
    expect(res.status).toBe(200);
    return proposalId;
  }

  async function getOutcomes(cookie: string): Promise<OutcomeDtoShape[]> {
    const res = await fetch(`${baseUrl}/api/outcomes`, { headers: { cookie } });
    expect(res.status).toBe(200);
    return (await res.json()) as OutcomeDtoShape[];
  }

  beforeAll(async () => {
    const app = await bootTestApp();
    baseUrl = app.baseUrl;
    stop = app.stop;

    cookieA = await signup("ds-A");
    await setupOrg(cookieA, "OrgDsA");
    cookieB = await signup("ds-B");
    await setupOrg(cookieB, "OrgDsB");

    // Org A : 2 outcomes LOST. Org B : 1 outcome LOST (pour distinguer l'isolation).
    await lostOutcome(cookieA, "A-outcome-1");
    await lostOutcome(cookieA, "A-outcome-2");
    await lostOutcome(cookieB, "B-outcome-1");
  });

  afterAll(async () => {
    await stop?.();
  });

  it("1. org A liste ses propres outcomes (avec context)", async () => {
    const outcomes = await getOutcomes(cookieA);
    expect(outcomes.length).toBe(2);
    const titles = outcomes.map((o) => o.proposalTitle).sort();
    expect(titles).toEqual(["A-outcome-1", "A-outcome-2"]);
    for (const o of outcomes) {
      expect(o.outcome).toBe("LOST");
      expect(o.reason).toBe("raison");
      expect(typeof o.context.amount).toBe("string");
      expect(typeof o.decidedAt).toBe("string");
    }
  });

  it("2. ISOLATION : org B ne voit AUCUN outcome d'org A (et inversement)", async () => {
    const outcomesB = await getOutcomes(cookieB);
    expect(outcomesB.length).toBe(1);
    expect(outcomesB[0].proposalTitle).toBe("B-outcome-1");
    // Aucun titre d'org A ne fuit côté B.
    expect(outcomesB.some((o) => o.proposalTitle.startsWith("A-"))).toBe(false);

    // Côté A : aucun titre d'org B.
    const outcomesA = await getOutcomes(cookieA);
    expect(outcomesA.some((o) => o.proposalTitle.startsWith("B-"))).toBe(false);
  });

  it("3. NO-PII : le context exposé par l'API contient EXACTEMENT les clés whitelist — aucune clé name/email", async () => {
    const outcomes = await getOutcomes(cookieA);
    expect(outcomes.length).toBeGreaterThan(0);
    for (const o of outcomes) {
      const keys = Object.keys(o.context).sort();
      // Clés EXACTES (whitelist RGPD) — pas de clientType par défaut, aucune PII.
      expect(keys).toEqual(["amount", "bodyTextLength", "deliverableCount", "lineCount"]);
      // Assertion d'ABSENCE explicite de clés name/email dans le context retourné.
      expect(keys).not.toContain("name");
      expect(keys).not.toContain("email");
    }
    // Sanity sérialisé : aucune occurrence de name/email dans les contexts exposés.
    const serializedContexts = JSON.stringify(outcomes.map((o) => o.context));
    expect(serializedContexts).not.toMatch(/name|email/i);
  });

  it("4. READ-ONLY : aucun endpoint d'écriture sur /api/outcomes (POST -> 404)", async () => {
    const res = await fetch(`${baseUrl}/api/outcomes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ outcome: "WON" }),
    });
    // Pas de route POST déclarée -> 404 (pas de saisie manuelle d'outcome, critère 3).
    expect(res.status).toBe(404);
  });
});
