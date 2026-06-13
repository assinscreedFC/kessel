import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e CONTACTS (CRM-01) — Postgres RÉEL via test-app.ts (push -> better-auth migrate), AUCUN mock.
//
// Prouve :
//  - le path RÉEL /api/contacts (celui que le web appellera via Caddy) répond 2xx — pas un 404 (Pitfall 1) ;
//  - une entrée invalide (email malformé) est rejetée 400 par le ValidationPipe global (T-2-input) ;
//  - un POST valide crée le contact (201) et il est ensuite lisible via GET (round-trip réel).

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

describe("e2e /api/contacts (CRM-01, real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookie: string;

  async function signup(label: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `${label}+${Date.now()}@kessel.test`,
        password: "Sup3r-Secret-Pw!",
        name: label,
      }),
    });
    expect([200, 201]).toContain(res.status);
    return cookieFrom(res);
  }

  beforeAll(async () => {
    app = await bootTestApp();

    // User d'org-A : signup -> crée l'org (devient owner) -> active l'org dans la session.
    cookie = await signup("contact-owner");
    const createRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Acme", slug: `acme-${Date.now()}` }),
    });
    expect([200, 201]).toContain(createRes.status);
    const org = (await createRes.json()) as { id: string };
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ organizationId: org.id }),
    });
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("GET /api/contacts (path RÉEL Caddy, Pitfall 1) -> 200, liste vide au départ", async () => {
    const res = await fetch(`${app.baseUrl}/api/contacts`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /api/contacts avec email invalide -> 400 (ValidationPipe, T-2-input)", async () => {
    const res = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Bad Email", email: "pas-un-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/contacts avec name vide -> 400 (ValidationPipe)", async () => {
    const res = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "", email: "ok@kessel.test" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/contacts valide -> 201, puis lisible via GET (round-trip réel)", async () => {
    const createRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "Alice Martin",
        email: "alice@client.test",
        organizationName: "Client SARL",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      id: string;
      name: string;
      email: string;
      organizationName: string | null;
    };
    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Alice Martin");
    expect(created.email).toBe("alice@client.test");
    expect(created.organizationName).toBe("Client SARL");

    const listRes = await fetch(`${app.baseUrl}/api/contacts`, { headers: { cookie } });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { id: string }[];
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });
});
