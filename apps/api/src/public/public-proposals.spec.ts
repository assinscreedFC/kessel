import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e MODULE PUBLIC (DELIV-01/02) — Postgres RÉEL + Chromium RÉEL via test-app.ts, ZÉRO simulacre (I/O réelles).
// Exerce le PATH RÉEL /api/public/proposals/* (anti-404 Caddy) SANS cookie (AuthGuard exclu).
//
// Prouve :
//  1. Token HASHÉ : POST /api/proposals/:id/send authentifié -> { token, url } ; en DB le
//     shareTokenHash est défini et !== token (stocké hashé, T-5-token), status SENT, sentAt non null,
//     1 event SENT.
//  2. GET public SANS cookie -> 200 (pas 401) ; corps contient title/bodyJson/lines/grandTotal et
//     NE contient PAS orgId/dealId bruts (T-5-iso).
//  3. PDF non signé public : GET :token/pdf SANS cookie par token valide -> 200 application/pdf %PDF ;
//     token bidon -> 404 (pas de leak).
//  4. OPENED/VIEWED : 1er GET -> 1 OPENED ; 2e GET -> toujours 1 OPENED (idempotent) ; POST /view ->
//     VIEWED ; GET /api/proposals/:id/events authentifié liste SENT+OPENED+VIEWED triés.
//  5. Token invalide -> 404 (pas de leak, pas de 500).
//  6. Isolation cross-tenant : un token aléatoire ne résout JAMAIS une proposition (anti-énumération) ;
//     aucun endpoint public ne renvoie de liste.
//  7. Rate-limit : marteler GET :token au-delà de 20/min -> au moins une réponse 429 (ThrottlerGuard).

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Proposition" }] },
    { type: "paragraph", content: [{ type: "text", text: "Bonjour, voici notre offre." }] },
  ],
};

describe("e2e /api/public/proposals/:token (DELIV-01/02 : token hashé, 404, isolation, OPENED/VIEWED, no-cookie 200, PDF non signé, rate-limit — real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
  let cookieB: string;
  let dealAId: string;
  let dealBId: string;

  async function signup(label: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}${SIGNUP}`, {
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
    const createRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name, slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
    });
    expect([200, 201]).toContain(createRes.status);
    const org = (await createRes.json()) as { id: string };
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ organizationId: org.id }),
    });
    return org.id;
  }

  async function createDeal(cookie: string): Promise<string> {
    const cRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Client", email: `c+${Date.now()}-${Math.random().toString(36).slice(2)}@x.test` }),
    });
    expect(cRes.status).toBe(201);
    const contact = (await cRes.json()) as { id: string };
    const dRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Deal", contactId: contact.id, status: "LEAD" }),
    });
    expect(dRes.status).toBe(201);
    const deal = (await dRes.json()) as { id: string };
    return deal.id;
  }

  async function createProposal(cookie: string, dealId: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Proposition publique", bodyJson: DOC }),
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as { id: string };
    return p.id;
  }

  async function addLine(cookie: string, proposalId: string): Promise<void> {
    const res = await fetch(`${app.baseUrl}/api/proposals/${proposalId}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Prestation conseil", quantity: 3, unitPrice: 12.35, position: 0 }),
    });
    expect(res.status).toBe(201);
  }

  // Envoie une proposition et renvoie { proposalId, token }.
  async function send(cookie: string, proposalId: string): Promise<{ token: string; url: string }> {
    const res = await fetch(`${app.baseUrl}/api/proposals/${proposalId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as { token: string; url: string };
    return body;
  }

  beforeAll(async () => {
    app = await bootTestApp();

    cookieA = await signup("pub-A");
    await setupOrg(cookieA, "OrgPubA");
    dealAId = await createDeal(cookieA);

    cookieB = await signup("pub-B");
    await setupOrg(cookieB, "OrgPubB");
    dealBId = await createDeal(cookieB);
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("1. token HASHÉ : send -> { token, url } ; en DB shareTokenHash défini, !== token, status SENT + sentAt + event SENT", async () => {
    const proposalId = await createProposal(cookieA, dealAId);
    const { token, url } = await send(cookieA, proposalId);

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
    expect(url).toContain(`/p/${token}`);

    // En DB : le hash est stocké, JAMAIS le token brut (T-5-token).
    const row = (await app.basePrisma.proposal.findUnique({ where: { id: proposalId } })) as {
      shareTokenHash: string | null;
      status: string;
      sentAt: Date | null;
    } | null;
    expect(row).not.toBeNull();
    expect(row!.shareTokenHash).toBeTruthy();
    expect(row!.shareTokenHash).not.toBe(token); // stocké hashé, pas en clair
    expect(row!.status).toBe("SENT");
    expect(row!.sentAt).not.toBeNull();

    const sentEvents = await app.basePrisma.proposalEvent.findMany({
      where: { proposalId, type: "SENT" },
    });
    expect(sentEvents).toHaveLength(1);
  });

  it("2. GET public SANS cookie -> 200 (AuthGuard exclu), corps lecture seule sans orgId/dealId bruts", async () => {
    const proposalId = await createProposal(cookieA, dealAId);
    await addLine(cookieA, proposalId);
    const { token } = await send(cookieA, proposalId);

    // AUCUN cookie -> doit être 200 (pas 401). C'est la preuve que @AllowAnonymous exclut l'AuthGuard.
    const res = await fetch(`${app.baseUrl}/api/public/proposals/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.title).toBe("Proposition publique");
    expect(body.bodyJson).toBeDefined();
    expect(Array.isArray(body.lines)).toBe(true);
    expect((body.lines as unknown[]).length).toBe(1);
    expect(typeof body.grandTotal).toBe("string");
    expect(body.grandTotal).toBe("37.05"); // 3 × 12.35
    // Anti-énumération : aucun id cross-org exploitable exposé.
    expect(body.orgId).toBeUndefined();
    expect(body.dealId).toBeUndefined();
  });

  it("3. PDF non signé public : GET :token/pdf SANS cookie token valide -> 200 application/pdf %PDF ; token bidon -> 404", async () => {
    const proposalId = await createProposal(cookieA, dealAId);
    await addLine(cookieA, proposalId);
    const { token } = await send(cookieA, proposalId);

    const res = await fetch(`${app.baseUrl}/api/public/proposals/${token}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.toString("utf8", 0, 4)).toBe("%PDF");

    // Token bidon -> 404 (pas de leak).
    const bad = await fetch(`${app.baseUrl}/api/public/proposals/un-token-bidon/pdf`);
    expect(bad.status).toBe(404);
  });

  it("4. OPENED idempotent + VIEWED + timeline events authentifiée triée", async () => {
    const proposalId = await createProposal(cookieA, dealAId);
    const { token } = await send(cookieA, proposalId);

    // 1er GET -> OPENED créé.
    await fetch(`${app.baseUrl}/api/public/proposals/${token}`);
    // 2e GET -> PAS de 2e OPENED (idempotent).
    await fetch(`${app.baseUrl}/api/public/proposals/${token}`);

    const opened = await app.basePrisma.proposalEvent.findMany({ where: { proposalId, type: "OPENED" } });
    expect(opened).toHaveLength(1);

    // POST /view -> VIEWED (peut être multiple).
    const viewRes = await fetch(`${app.baseUrl}/api/public/proposals/${token}/view`, { method: "POST" });
    expect(viewRes.status).toBe(204);
    const viewed = await app.basePrisma.proposalEvent.findMany({ where: { proposalId, type: "VIEWED" } });
    expect(viewed.length).toBeGreaterThanOrEqual(1);

    // Timeline dashboard authentifiée : SENT + OPENED + VIEWED, triés par occurredAt.
    const eventsRes = await fetch(`${app.baseUrl}/api/proposals/${proposalId}/events`, { headers: { cookie: cookieA } });
    expect(eventsRes.status).toBe(200);
    const events = (await eventsRes.json()) as { type: string; occurredAt: string }[];
    const types = events.map((e) => e.type);
    expect(types).toContain("SENT");
    expect(types).toContain("OPENED");
    expect(types).toContain("VIEWED");
    // Triés croissants.
    const times = events.map((e) => new Date(e.occurredAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("5. token invalide -> 404 (GET), pas de 500 ni de leak", async () => {
    const res = await fetch(`${app.baseUrl}/api/public/proposals/un-token-totalement-bidon`);
    expect(res.status).toBe(404);
    // POST /view sur token bidon -> 404 aussi.
    const viewRes = await fetch(`${app.baseUrl}/api/public/proposals/un-token-totalement-bidon/view`, { method: "POST" });
    expect(viewRes.status).toBe(404);
  });

  it("6. isolation cross-tenant : token d'org-B résout SA proposition (le token EST le secret), un token aléatoire -> 404 (anti-énumération)", async () => {
    // org-B envoie sa proposition ; son token résout SA proposition (le token est le secret porteur).
    const proposalB = await createProposal(cookieB, dealBId);
    const { token: tokenB } = await send(cookieB, proposalB);
    const resB = await fetch(`${app.baseUrl}/api/public/proposals/${tokenB}`);
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as { title: string };
    expect(bodyB.title).toBe("Proposition publique");

    // Aucun token forgé/aléatoire ne résout une proposition d'une autre org : 404 indifférencié.
    // (Anti-énumération : pas d'endpoint liste, le hash @unique ne fuite aucune existence.)
    const forged = await fetch(`${app.baseUrl}/api/public/proposals/${tokenB.slice(0, -3)}xyz`);
    expect(forged.status).toBe(404);
  });

  it("7. rate-limit : marteler GET :token au-delà de 20/min -> au moins une réponse 429 (ThrottlerGuard)", async () => {
    const proposalId = await createProposal(cookieA, dealAId);
    const { token } = await send(cookieA, proposalId);

    // 25 requêtes séquentielles (même IP en test) > limite 20/min -> au moins une 429.
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${app.baseUrl}/api/public/proposals/${token}`);
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});
