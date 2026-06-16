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

  // =========================================================================
  // CRM-07 : Vue 360 — GET /api/contacts/:id/overview
  // RED : ces tests DOIVENT ÉCHOUER car l'endpoint n'est pas encore implémenté (Wave 0).
  // =========================================================================

  it("CRM-07 : GET /api/contacts/:id/overview agrège { contact, deals, proposals, projects }", async () => {
    // Créer un contact
    const createRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Vue360 Contact", email: "vue360@client.test" }),
    });
    expect(createRes.status).toBe(201);
    const contact = (await createRes.json()) as { id: string };

    // CRM-07 : GET overview
    const overviewRes = await fetch(`${app.baseUrl}/api/contacts/${contact.id}/overview`, {
      headers: { cookie },
    });
    // RED : 404 attendu (endpoint absent)
    expect(overviewRes.status).toBe(200);
    const overview = (await overviewRes.json()) as {
      contact: { id: string };
      deals: unknown[];
      proposals: unknown[];
      projects: unknown[];
    };
    expect(overview.contact.id).toBe(contact.id);
    expect(Array.isArray(overview.deals)).toBe(true);
    expect(Array.isArray(overview.proposals)).toBe(true);
    expect(Array.isArray(overview.projects)).toBe(true);
  });

  it("CRM-07 IDOR : GET /api/contacts/:id/overview avec contactId d'une AUTRE org -> 404", async () => {
    // Setup : org B avec un contact
    const signupRes = await fetch(`${app.baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `crm07-idor-${Date.now()}@kessel.test`,
        password: "Sup3r-Secret-Pw!",
        name: "OrgB-CRM07",
      }),
    });
    expect([200, 201]).toContain(signupRes.status);
    const cookieB = cookieFrom(signupRes);

    const createOrgRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ name: "OrgB07", slug: `orgb07-${Date.now()}` }),
    });
    const orgB = (await createOrgRes.json()) as { id: string };
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ organizationId: orgB.id }),
    });

    const contactBRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ name: "OrgB Contact", email: `orgb-contact-${Date.now()}@client.test` }),
    });
    expect(contactBRes.status).toBe(201);
    const contactB = (await contactBRes.json()) as { id: string };

    // Org A tente d'accéder à l'overview d'un contact org B -> 404
    const overviewRes = await fetch(`${app.baseUrl}/api/contacts/${contactB.id}/overview`, {
      headers: { cookie },
    });
    expect(overviewRes.status).toBe(404);
  });

  // =========================================================================
  // CRM-09 : Import CSV — POST /api/contacts/import
  // RED : ces tests DOIVENT ÉCHOUER car l'endpoint n'est pas encore implémenté (Wave 0).
  // =========================================================================

  it("CRM-09 : POST /api/contacts/import CSV valide -> { imported, skipped, errors }", async () => {
    // CSV avec 2 contacts valides (colonnes FR)
    const csv = [
      "nom,email,organisation",
      "Jean Dupont,jean@import.test,Acme SA",
      "Marie Martin,marie@import.test,Beta Corp",
    ].join("\n");

    const formData = new FormData();
    formData.append("file", new Blob([csv], { type: "text/csv" }), "contacts.csv");

    const res = await fetch(`${app.baseUrl}/api/contacts/import`, {
      method: "POST",
      headers: { cookie },
      body: formData,
    });
    // RED : 404 attendu (endpoint absent)
    expect(res.status).toBe(200);
    const result = (await res.json()) as {
      imported: number;
      skipped: number;
      errors: string[];
    };
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it("CRM-09 : email dupliqué dans l'org -> skipped++, pas d'écrasement", async () => {
    // Créer un contact existant avec l'email qui sera dans le CSV
    const existingEmail = `duplicate-${Date.now()}@import.test`;
    const createRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Existant", email: existingEmail }),
    });
    expect(createRes.status).toBe(201);

    // CSV contenant l'email existant + 1 nouveau
    const csv = [
      "nom,email,organisation",
      `Existant Copie,${existingEmail},Org Dupliqué`,
      "Nouveau Contact,nouveau-unique@import.test,Nouvelle Org",
    ].join("\n");

    const formData = new FormData();
    formData.append("file", new Blob([csv], { type: "text/csv" }), "contacts.csv");

    const res = await fetch(`${app.baseUrl}/api/contacts/import`, {
      method: "POST",
      headers: { cookie },
      body: formData,
    });
    // RED : 404 attendu (endpoint absent)
    expect(res.status).toBe(200);
    const result = (await res.json()) as {
      imported: number;
      skipped: number;
      errors: string[];
    };
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1); // email existant -> skipped
    expect(result.errors.length).toBe(0);
  });

  it("CRM-09 : organisation dans CSV -> find-or-create ClientOrg scopé org", async () => {
    const orgName = `ImportOrg-${Date.now()}`;
    const csv = [
      "nom,email,organisation",
      `Contact Org1,org1-${Date.now()}@import.test,${orgName}`,
      `Contact Org2,org2-${Date.now()}@import.test,${orgName}`,
    ].join("\n");

    const formData = new FormData();
    formData.append("file", new Blob([csv], { type: "text/csv" }), "contacts.csv");

    const res = await fetch(`${app.baseUrl}/api/contacts/import`, {
      method: "POST",
      headers: { cookie },
      body: formData,
    });
    // RED : 404 attendu (endpoint absent)
    expect(res.status).toBe(200);
    const result = (await res.json()) as { imported: number; skipped: number; errors: string[] };
    expect(result.imported).toBe(2);
    // Vérifier qu'une seule ClientOrg a été créée (find-or-create, pas 2 créations)
    const clientOrgs = await app.basePrisma.clientOrg.findMany({
      where: { name: orgName },
    });
    expect(clientOrgs.length).toBe(1); // find-or-create idempotent
  });
});
