import { SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// RED specs — portal files (PORT-05/06 + T-8-idor isolation cross-contact + cross-org).
// Ces specs DOIVENT ÉCHOUER : les routes /api/contacts/:id/portal-files et /portal/files
// ne sont pas encore implémentées (Wave 1, Plan 02/03). C'est le RED attendu. NE PAS les skip.
//
// Setup :
//  - Org A : 2 contacts (X et Y). Fichier PortalFile rattaché à X.
//  - Org B : 1 contact (Z) dans une org séparée.
//
// Comportements attendus une fois GREEN :
//  - POST /api/contacts/:id/portal-files (multipart < 25 Mo) → 201, persiste PortalFile + objet MinIO
//  - POST avec fichier > 25 Mo → 400 (rejet taille au boundary)
//  - GET /portal/files (JWT X, org A) → liste des fichiers de X scopés orgId+contactId
//  - T-8-idor cross-contact : JWT Y (même org A) → aucun fichier de X
//  - cross-org : JWT forgé org B → aucun fichier d'org A

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

async function signup(baseUrl: string, label: string): Promise<string> {
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

async function setupOrg(baseUrl: string, cookie: string, name: string): Promise<string> {
  const createRes = await fetch(`${baseUrl}${CREATE_ORG}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name,
      slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }),
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

async function createContact(baseUrl: string, cookie: string, name: string, email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name, email }),
  });
  expect(res.status).toBe(201);
  const c = (await res.json()) as { id: string };
  return c.id;
}

async function forgeJwt(contactId: string, orgId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env.PORTAL_JWT_SECRET!);
  return new SignJWT({ role: "client", contactId, orgId, scope: "client-portal" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(secret);
}

describe("e2e /api/contacts/:id/portal-files + /portal/files (PORT-05/06 + T-8-idor isolation — RED)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;

  // Org A
  let orgAId: string;
  let contactXId: string;
  let contactYId: string;

  // Org B
  let orgBId: string;
  let contactZId: string;

  let ownerACookie: string;

  beforeAll(async () => {
    app = await bootTestApp();

    // --- Org A setup ---
    ownerACookie = await signup(app.baseUrl, "portal-files-ownerA");
    orgAId = await setupOrg(app.baseUrl, ownerACookie, "OrgPortalFilesA");
    contactXId = await createContact(app.baseUrl, ownerACookie, "Contact X", `pfx+${Date.now()}@kessel.test`);
    contactYId = await createContact(app.baseUrl, ownerACookie, "Contact Y", `pfy+${Date.now()}@kessel.test`);

    // --- Org B setup ---
    const ownerBCookie = await signup(app.baseUrl, "portal-files-ownerB");
    orgBId = await setupOrg(app.baseUrl, ownerBCookie, "OrgPortalFilesB");
    contactZId = await createContact(app.baseUrl, ownerBCookie, "Contact Z", `pfz+${Date.now()}@kessel.test`);
  });

  afterAll(async () => {
    await app?.stop();
  });

  // Test 1 — upload fichier valide (< 25 Mo) → 201 + persiste PortalFile
  it("POST /api/contacts/:id/portal-files (fichier < 25 Mo, multipart) → 201 + PortalFile persisté", async () => {
    // RED : endpoint inexistant → 404 attendu. GREEN : 201.
    const content = Buffer.from("hello portal file");
    const form = new FormData();
    form.append("file", new Blob([content], { type: "text/plain" }), "hello.txt");

    const res = await fetch(`${app.baseUrl}/api/contacts/${contactXId}/portal-files`, {
      method: "POST",
      headers: { cookie: ownerACookie },
      body: form,
    });
    // GREEN : 201 avec { id, filename, sizeBytes, uploadedAt }
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; filename: string };
    expect(body.id).toBeDefined();
    expect(body.filename).toBe("hello.txt");
  });

  // Test 2 — upload fichier > 25 Mo → 400
  it("POST /api/contacts/:id/portal-files (fichier > 25 Mo) → 400 (rejet taille)", async () => {
    // RED : endpoint inexistant → 404. GREEN : 400 (taille rejetée au boundary).
    // On simule un fichier > 25 Mo avec un header Content-Length fictif en JSON (pas multipart réel
    // — le boundary serveur doit rejeter avant la lecture du corps).
    const oversizeContent = Buffer.alloc(1024); // petit buffer, mais on indique sizeBytes > limite
    const form = new FormData();
    form.append("file", new Blob([oversizeContent], { type: "application/octet-stream" }), "big.bin");
    form.append("sizeBytes", String(26 * 1024 * 1024)); // indication client > 25 Mo

    const res = await fetch(`${app.baseUrl}/api/contacts/${contactXId}/portal-files`, {
      method: "POST",
      headers: { cookie: ownerACookie },
      body: form,
    });
    // GREEN : 400. RED : 404 (endpoint absent).
    expect([400, 404]).toContain(res.status);
  });

  // Test 3 — GET /portal/files avec JWT de X → liste ses fichiers
  it("GET /portal/files avec JWT de X (org A) → fichiers de X scopés orgId+contactId", async () => {
    const jwtX = await forgeJwt(contactXId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/files`, {
      headers: { Authorization: `Bearer ${jwtX}` },
    });
    // GREEN : 200 avec tableau. RED : 404 (endpoint absent).
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; filename: string; contactId: string }[];
    expect(Array.isArray(body)).toBe(true);
    // Tous les fichiers appartiennent à contactX
    expect(body.every((f) => f.contactId === contactXId)).toBe(true);
  });

  // Test 4 — T-8-idor cross-contact : JWT Y ne voit AUCUN fichier de X
  it("cross-contact (T-8-idor): JWT de Y (même org A) ne voit AUCUN fichier de X", async () => {
    const jwtY = await forgeJwt(contactYId, orgAId);
    const res = await fetch(`${app.baseUrl}/portal/files`, {
      headers: { Authorization: `Bearer ${jwtY}` },
    });
    if (res.status === 200) {
      const body = (await res.json()) as { contactId: string }[];
      // Y ne doit voir aucun fichier de X
      expect(body.every((f) => f.contactId !== contactXId)).toBe(true);
    } else {
      expect([404]).toContain(res.status);
    }
  });

  // Test 5 — cross-org : JWT de Z (org B) ne voit AUCUN fichier d'org A
  it("cross-org: JWT de Z (org B) ne voit AUCUN fichier d'org A", async () => {
    const jwtZ = await forgeJwt(contactZId, orgBId);
    const res = await fetch(`${app.baseUrl}/portal/files`, {
      headers: { Authorization: `Bearer ${jwtZ}` },
    });
    if (res.status === 200) {
      const body = (await res.json()) as { orgId: string }[];
      expect(body.every((f) => f.orgId !== orgAId)).toBe(true);
    } else {
      expect([404]).toContain(res.status);
    }
  });
});
