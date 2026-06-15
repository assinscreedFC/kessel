import { createHash, randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e portail client — DATA (PORT-02/03/04 + isolation SC5) — RED specs.
// Ces specs DOIVENT ÉCHOUER : les routes /portal/proposals, /portal/project, /portal/payments
// ne sont pas encore implémentées (Plans 02/03). C'est le RED attendu. NE PAS les skip.
//
// Setup :
//  - Org A : 2 contacts (X et Y). Proposal/Deal/Project/Payments rattachés à X.
//  - Org B : 1 contact (Z) dans une org séparée.
//
// Comportements attendus une fois GREEN :
//  - JWT de X -> voit ses proposals/project/payments
//  - JWT de Y (même org A) -> ne voit AUCUNE donnée de X (cross-contact isolation)
//  - JWT forgé pour org B -> ne voit aucune donnée d'org A (cross-org isolation SC5)
//  - AUCUN endpoint d'écriture sous /portal/* (hors /portal/auth/exchange)

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function forgeJwt(contactId: string, orgId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.PORTAL_JWT_SECRET!);
  return new SignJWT({ role: "client", contactId, orgId, scope: "client-portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
}

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";

describe("e2e /portal/proposals|project|payments (PORT-02/03/04 + isolation cross-contact + cross-org SC5 — RED)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;

  // Org A
  let orgAId: string;
  let contactXId: string;
  let contactYId: string;

  // Org B
  let orgBId: string;
  let contactZId: string;

  // Données rattachées à X
  let proposalXId: string;
  let projectXId: string;
  let paymentDepositId: string;
  let paymentBalanceId: string;

  // Cookies portail pour les tests (obtenus via exchange)
  let cookieX: string;
  let cookieY: string;

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
      body: JSON.stringify({
        name,
        slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
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

  async function createContact(cookie: string, name: string, email: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name, email }),
    });
    expect(res.status).toBe(201);
    const c = (await res.json()) as { id: string };
    return c.id;
  }

  async function getPortalCookie(contactId: string): Promise<string> {
    const raw = generateRawToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await app.basePrisma.portalSession.create({
      data: { contactId, tokenHash: hashToken(raw), expiresAt },
    });
    const res = await fetch(`${app.baseUrl}/portal/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: raw }),
    });
    // En RED, exchange retourne 404/connexion error — on propagerait le cookie si 200.
    // En GREEN, cela retourne le cookie de session portail.
    return cookieFrom(res);
  }

  beforeAll(async () => {
    app = await bootTestApp();

    // --- Org A setup ---
    const cookieOwnerA = await signup("portal-data-ownerA");
    orgAId = await setupOrg(cookieOwnerA, "OrgPortalDataA");

    contactXId = await createContact(cookieOwnerA, "Contact X", `cx+${Date.now()}@kessel.test`);
    contactYId = await createContact(cookieOwnerA, "Contact Y", `cy+${Date.now()}@kessel.test`);

    // Deal rattaché à X
    const dealRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieOwnerA },
      body: JSON.stringify({ title: "Deal X", contactId: contactXId, status: "LEAD" }),
    });
    expect(dealRes.status).toBe(201);
    const deal = (await dealRes.json()) as { id: string };
    const dealXId = deal.id;

    // Proposition rattachée au deal de X
    const propRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieOwnerA },
      body: JSON.stringify({
        dealId: dealXId,
        title: "Proposition X",
        bodyJson: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Bonjour X" }] }],
        },
      }),
    });
    expect(propRes.status).toBe(201);
    const proposal = (await propRes.json()) as { id: string };
    proposalXId = proposal.id;

    // Insérer Project + Payments directement via basePrisma (les routes de création sont côté admin)
    const project = await app.basePrisma.project.create({
      data: {
        orgId: orgAId,
        dealId: dealXId,
        proposalId: proposalXId,
        title: "Projet X",
        status: "ACTIVE",
        budgetSnapshot: "1000.00",
      },
    });
    projectXId = project.id;

    // Payment acompte (DEPOSIT)
    const payDeposit = await app.basePrisma.payment.create({
      data: {
        orgId: orgAId,
        projectId: projectXId,
        stripePaymentIntentId: `pi_test_deposit_${Date.now()}`,
        kind: "DEPOSIT",
        status: "PENDING",
        amountCents: 30000,
        currency: "eur",
      },
    });
    paymentDepositId = payDeposit.id;

    // Payment solde (BALANCE)
    const payBalance = await app.basePrisma.payment.create({
      data: {
        orgId: orgAId,
        projectId: projectXId,
        stripePaymentIntentId: `pi_test_balance_${Date.now()}`,
        kind: "BALANCE",
        status: "PENDING",
        amountCents: 70000,
        currency: "eur",
      },
    });
    paymentBalanceId = payBalance.id;

    // --- Org B setup ---
    const cookieOwnerB = await signup("portal-data-ownerB");
    orgBId = await setupOrg(cookieOwnerB, "OrgPortalDataB");
    contactZId = await createContact(cookieOwnerB, "Contact Z", `cz+${Date.now()}@kessel.test`);

    // Obtenir les cookies portail de X et Y via exchange (en RED = vide, en GREEN = cookie)
    cookieX = await getPortalCookie(contactXId);
    cookieY = await getPortalCookie(contactYId);
  });

  afterAll(async () => {
    await app?.stop();
  });

  // ---- PORT-02 : Proposals ----

  it("GET /portal/proposals avec JWT de X -> liste les propositions de X (statuts DRAFT/SENT/SIGNED)", async () => {
    const jwtX = await forgeJwt(contactXId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/proposals`, {
      headers: { Authorization: `Bearer ${jwtX}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; title: string; status: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p) => p.id === proposalXId)).toBe(true);
    expect(body.every((p) => ["DRAFT", "SENT", "SIGNED"].includes(p.status))).toBe(true);
  });

  it("cross-contact: JWT de Y (même org A) ne voit AUCUNE proposition de X", async () => {
    const jwtY = await forgeJwt(contactYId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/proposals`, {
      headers: { Authorization: `Bearer ${jwtY}` },
    });
    // 200 avec liste vide OU 404 — jamais les propositions de X
    if (res.status === 200) {
      const body = (await res.json()) as { id: string }[];
      expect(body.some((p) => p.id === proposalXId)).toBe(false);
    } else {
      expect([404]).toContain(res.status);
    }
  });

  it("cross-org: JWT forgé pour contact Z (org B) ne voit aucune proposition d'org A", async () => {
    const jwtZ = await forgeJwt(contactZId, orgBId);
    const res = await fetch(`${app.baseUrl}/portal/proposals`, {
      headers: { Authorization: `Bearer ${jwtZ}` },
    });
    if (res.status === 200) {
      const body = (await res.json()) as { id: string }[];
      expect(body.some((p) => p.id === proposalXId)).toBe(false);
    } else {
      expect([404]).toContain(res.status);
    }
  });

  // ---- PORT-03 : Project ----

  it("GET /portal/project avec JWT de X -> projet + tasks (lecture seule)", async () => {
    const jwtX = await forgeJwt(contactXId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/project`, {
      headers: { Authorization: `Bearer ${jwtX}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string; tasks: unknown[] };
    expect(body.id).toBe(projectXId);
    expect(Array.isArray(body.tasks)).toBe(true);
  });

  it("cross-contact: JWT de Y ne voit PAS le projet de X", async () => {
    const jwtY = await forgeJwt(contactYId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/project`, {
      headers: { Authorization: `Bearer ${jwtY}` },
    });
    if (res.status === 200) {
      const body = (await res.json()) as { id?: string } | null;
      expect(body).toBeNull();
    } else {
      expect([404]).toContain(res.status);
    }
  });

  it("cross-org: JWT de Z (org B) ne voit PAS le projet d'org A", async () => {
    const jwtZ = await forgeJwt(contactZId, orgBId);
    const res = await fetch(`${app.baseUrl}/portal/project`, {
      headers: { Authorization: `Bearer ${jwtZ}` },
    });
    if (res.status === 200) {
      const body = (await res.json()) as { id?: string } | null;
      if (body) expect(body.id).not.toBe(projectXId);
    } else {
      expect([404]).toContain(res.status);
    }
  });

  // ---- PORT-04 : Payments ----

  it("GET /portal/payments avec JWT de X -> statuts acompte/solde (DEPOSIT/BALANCE, PENDING/PAID/FAILED)", async () => {
    const jwtX = await forgeJwt(contactXId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/payments`, {
      headers: { Authorization: `Bearer ${jwtX}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; kind: string; status: string }[];
    expect(Array.isArray(body)).toBe(true);
    const ids = body.map((p) => p.id);
    expect(ids).toContain(paymentDepositId);
    expect(ids).toContain(paymentBalanceId);
    expect(body.every((p) => ["DEPOSIT", "BALANCE"].includes(p.kind))).toBe(true);
    expect(body.every((p) => ["PENDING", "PAID", "FAILED"].includes(p.status))).toBe(true);
  });

  it("cross-contact: JWT de Y (même org A) ne voit AUCUN payment de X", async () => {
    const jwtY = await forgeJwt(contactYId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/payments`, {
      headers: { Authorization: `Bearer ${jwtY}` },
    });
    if (res.status === 200) {
      const body = (await res.json()) as { id: string }[];
      const ids = body.map((p) => p.id);
      expect(ids).not.toContain(paymentDepositId);
      expect(ids).not.toContain(paymentBalanceId);
    } else {
      expect([404]).toContain(res.status);
    }
  });

  it("cross-org: JWT de Z (org B) ne voit AUCUN payment d'org A", async () => {
    const jwtZ = await forgeJwt(contactZId, orgBId);
    const res = await fetch(`${app.baseUrl}/portal/payments`, {
      headers: { Authorization: `Bearer ${jwtZ}` },
    });
    if (res.status === 200) {
      const body = (await res.json()) as { id: string }[];
      const ids = body.map((p) => p.id);
      expect(ids).not.toContain(paymentDepositId);
      expect(ids).not.toContain(paymentBalanceId);
    } else {
      expect([404]).toContain(res.status);
    }
  });

  // ---- AUCUN endpoint d'écriture portail ----

  it("AUCUN endpoint d'écriture : POST /portal/proposals -> 404 ou 405", async () => {
    const jwtX = await forgeJwt(contactXId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${jwtX}` },
      body: JSON.stringify({ title: "hack" }),
    });
    expect([404, 405]).toContain(res.status);
  });

  it("AUCUN endpoint d'écriture : PATCH /portal/project -> 404 ou 405", async () => {
    const jwtX = await forgeJwt(contactXId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/project`, {
      method: "PATCH",
      headers: { "content-type": "application/json", Authorization: `Bearer ${jwtX}` },
      body: JSON.stringify({ name: "hacked" }),
    });
    expect([404, 405]).toContain(res.status);
  });

  it("AUCUN endpoint d'écriture : DELETE /portal/payments/:id -> 404 ou 405", async () => {
    const jwtX = await forgeJwt(contactXId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/payments/${paymentDepositId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${jwtX}` },
    });
    expect([404, 405]).toContain(res.status);
  });
});
