import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e portail client — AUTH (PORT-01) — RED specs.
// Ces specs DOIVENT ÉCHOUER : les routes /portal/auth/* et /portal/me ne sont pas encore
// implémentées (Plans 02/03). C'est le RED attendu. NE PAS les skip.
//
// Comportements attendus une fois GREEN :
//  - POST /portal/auth/exchange(token valide) -> 200 + Set-Cookie portal_session= HttpOnly
//  - Token inconnu/expiré/déjà utilisé -> 401 uniforme (même corps, pas de distinguo)
//  - Double exchange du MÊME token -> premier 200, second 401 (single-use via usedAt)
//  - GET /portal/me sans cookie -> 401 ; avec cookie valide -> 200 + { contactId, orgId }

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";

describe("e2e /portal/auth + /portal/me (PORT-01 : exchange magic link, 401 uniforme, single-use, /portal/me — RED)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let contactId: string;
  let orgId: string;

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

  beforeAll(async () => {
    app = await bootTestApp();

    // Setup : org + contact pour les tests d'exchange
    const cookie = await signup("portal-auth-test");
    orgId = await setupOrg(cookie, "OrgPortalAuth");

    // Créer un contact via l'API CRM
    const cRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "Contact Portail",
        email: `contact-portail+${Date.now()}@kessel.test`,
      }),
    });
    expect(cRes.status).toBe(201);
    const contact = (await cRes.json()) as { id: string };
    contactId = contact.id;
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("1. exchange token valide -> 200 + Set-Cookie portal_session= HttpOnly", async () => {
    // Insérer une PortalSession valide en DB via basePrisma
    const raw = generateRawToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // +15 min
    await app.basePrisma.portalSession.create({
      data: { contactId, tokenHash: hashToken(raw), expiresAt },
    });

    const res = await fetch(`${app.baseUrl}/portal/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: raw }),
    });

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("portal_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("2. token inconnu -> 401 uniforme", async () => {
    const res = await fetch(`${app.baseUrl}/portal/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: generateRawToken() }),
    });
    expect(res.status).toBe(401);
  });

  it("3. token expiré (expiresAt < now) -> 401 uniforme", async () => {
    const raw = generateRawToken();
    const expiresAt = new Date(Date.now() - 60 * 1000); // déjà expiré
    await app.basePrisma.portalSession.create({
      data: { contactId, tokenHash: hashToken(raw), expiresAt },
    });

    const res = await fetch(`${app.baseUrl}/portal/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: raw }),
    });
    expect(res.status).toBe(401);
  });

  it("4. token déjà utilisé (usedAt non null) -> 401 uniforme", async () => {
    const raw = generateRawToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await app.basePrisma.portalSession.create({
      data: { contactId, tokenHash: hashToken(raw), expiresAt, usedAt: new Date() },
    });

    const res = await fetch(`${app.baseUrl}/portal/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: raw }),
    });
    expect(res.status).toBe(401);
  });

  it("5. double exchange du même token (race) -> premier 200, second 401 (single-use)", async () => {
    const raw = generateRawToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await app.basePrisma.portalSession.create({
      data: { contactId, tokenHash: hashToken(raw), expiresAt },
    });

    // Premier exchange
    const first = await fetch(`${app.baseUrl}/portal/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: raw }),
    });
    expect(first.status).toBe(200);

    // Deuxième exchange du même token -> 401 (usedAt positionné par le premier)
    const second = await fetch(`${app.baseUrl}/portal/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: raw }),
    });
    expect(second.status).toBe(401);
  });

  it("6. GET /portal/me sans cookie -> 401", async () => {
    const res = await fetch(`${app.baseUrl}/portal/me`);
    expect(res.status).toBe(401);
  });

  it("7. GET /portal/me avec cookie valide -> 200 + { contactId, orgId } cohérents", async () => {
    const raw = generateRawToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await app.basePrisma.portalSession.create({
      data: { contactId, tokenHash: hashToken(raw), expiresAt },
    });

    const exchangeRes = await fetch(`${app.baseUrl}/portal/auth/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: raw }),
    });
    expect(exchangeRes.status).toBe(200);
    const portalCookie = cookieFrom(exchangeRes);

    const meRes = await fetch(`${app.baseUrl}/portal/me`, {
      headers: { cookie: portalCookie },
    });
    expect(meRes.status).toBe(200);
    const body = (await meRes.json()) as { contactId: string; orgId: string };
    expect(body.contactId).toBe(contactId);
    expect(body.orgId).toBe(orgId);
  });
});
