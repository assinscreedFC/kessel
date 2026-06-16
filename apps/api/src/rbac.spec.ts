import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "./test-app";

// --- viewer block added in Phase 5, plan 05-01 (RED) ---
// Couvre API-06 : rôle `viewer` (lecture seule), bloqué sur toutes les routes d'écriture (POST/PATCH).
// Note Open Question 3 (05-RESEARCH) : Better Auth 1.6.18 peut rejeter role:'viewer' hors des valeurs
// prédéfinies (owner/admin/member). Si addMember rejette, on fallback sur basePrisma.$executeRaw pour
// insérer le membre directement en SQL (contournement documenté, plan 05-05 clarifiera).
// Ces tests doivent ÉCHOUER (RED) jusqu'à ce que RolesGuard soit implémenté en plan 05-05.

// Test RBAC (FOUND-03 / T-1-02) + PREUVE D'ÉGALITÉ DES ESPACES D'ID (T-1-10) — Postgres RÉEL, AUCUN mock.
//
// Prouve :
//  1. owner -> POST /settings = 200 ; member -> POST /settings = 403 (escalade de privilège bloquée
//     AU CONTRÔLEUR via @OrgRoles(["owner"])).
//  2. couche ORM : forOrg(autreOrg) n'affecte AUCUNE ligne de l'org cible (row-level, double application).
//  3. ÉGALITÉ DES ESPACES D'ID (anti faux-vert) : l'orgId vu par la session/@OrgRoles
//     (Better Auth activeOrganizationId) EST EXACTEMENT l'orgId que forOrg filtre ET le FK OrgNote.orgId,
//     et il EXISTE dans la table `organization` (pas un id fantôme). Un seul espace d'id.

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";
const GET_SESSION = "/api/auth/get-session";

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

describe("RBAC owner/member + égalité des espaces d'id org (FOUND-03 / T-1-02 / T-1-10, real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let ownerCookie: string;
  let memberCookie: string;
  let orgId: string;
  let memberUserId: string;

  async function signup(label: string): Promise<{ cookie: string; userId: string }> {
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
    const body = (await res.json()) as { user: { id: string } };
    return { cookie: cookieFrom(res), userId: body.user.id };
  }

  beforeAll(async () => {
    app = await bootTestApp();

    // 1. Owner : signup -> crée l'org (devient owner, activeOrganizationId posé en session).
    const owner = await signup("owner");
    ownerCookie = owner.cookie;

    const createRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ name: "Acme", slug: `acme-${Date.now()}` }),
    });
    expect([200, 201]).toContain(createRes.status);
    const org = (await createRes.json()) as { id: string };
    orgId = org.id;

    // S'assurer que l'org est ACTIVE dans la session de l'owner (activeOrganizationId).
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ organizationId: orgId }),
    });

    // 2. Member : signup -> ajouté à l'org avec le rôle "member" (API serveur addMember),
    //    puis active l'org dans SA session.
    const member = await signup("member");
    memberCookie = member.cookie;
    memberUserId = member.userId;

    await app.auth.api.addMember({
      body: { userId: memberUserId, organizationId: orgId, role: "member" },
      headers: new Headers({ cookie: ownerCookie }),
    });

    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: memberCookie },
      body: JSON.stringify({ organizationId: orgId }),
    });
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("owner -> POST /settings = 200 (action owner-only autorisée)", async () => {
    const res = await fetch(`${app.baseUrl}/settings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ note: "owner change" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { orgId: string; noteId: string };
    expect(body.orgId).toBe(orgId);
  });

  it("member -> POST /settings = 403 (escalade de privilège bloquée au contrôleur, T-1-02)", async () => {
    const res = await fetch(`${app.baseUrl}/settings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: memberCookie },
      body: JSON.stringify({ note: "member tries owner action" }),
    });
    expect(res.status).toBe(403);
  });

  it("ORM : forOrg(autre org) n'affecte AUCUNE ligne de l'org cible (row-level, double application)", async () => {
    // L'owner a créé au moins 1 OrgNote (test précédent). Une autre org ne peut pas la toucher.
    const otherOrgId = "org-INEXISTANT-cross";
    const res = await app
      .forOrg(otherOrgId)
      .orgNote.updateMany({ where: { orgId }, data: { body: "hacked" } });
    expect(res.count).toBe(0);

    // La/les note(s) de l'org cible restent lisibles par forOrg(orgId).
    const own = await app.forOrg(orgId).orgNote.findMany();
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((n) => n.orgId === orgId)).toBe(true);
  });

  it("ÉGALITÉ DES ESPACES D'ID : session.activeOrganizationId === orgId filtré par forOrg === FK OrgNote.orgId, et existe dans organization", async () => {
    // (a) orgId vu par la session/@OrgRoles (Better Auth activeOrganizationId) de l'owner.
    const sessionRes = await fetch(`${app.baseUrl}${GET_SESSION}`, {
      headers: { cookie: ownerCookie },
    });
    expect(sessionRes.status).toBe(200);
    const session = (await sessionRes.json()) as {
      session: { activeOrganizationId?: string };
    };
    const activeOrgId = session.session.activeOrganizationId;
    expect(activeOrgId).toBe(orgId); // l'id de session === l'org créée

    // (b) cet orgId EXISTE dans la table canonique `organization` (pas un id fantôme).
    const orgRow = await app.basePrisma.organization.findUnique({ where: { id: activeOrgId! } });
    expect(orgRow).not.toBeNull();
    expect(orgRow?.id).toBe(activeOrgId);

    // (c) c'est EXACTEMENT l'orgId que forOrg utilise : on lit une ligne créée par l'action
    //     owner-only (POST /settings) et on vérifie que son FK orgId === activeOrganizationId.
    const createdViaForOrg = await app.forOrg(activeOrgId!).orgNote.findFirst();
    expect(createdViaForOrg).not.toBeNull();
    expect(createdViaForOrg?.orgId).toBe(activeOrgId);

    // Conclusion : activeOrganizationId (@OrgRoles/session) === orgId filtré par forOrg
    //   === FK OrgNote.orgId === organization.id. Un seul espace d'id (T-1-10, pas d'isolation fantôme).
  });
});

// ─── API-06 : viewer role (RED — RolesGuard implemented in plan 05-05) ────────
//
// Prouve :
//  - session viewer -> GET /api/deals -> 200 (lecture autorisée)
//  - session viewer -> POST /api/deals -> 403 (écriture bloquée par RolesGuard)
//  - session viewer -> PATCH /api/deals/:id -> 403
//  - session member -> POST /api/deals -> 201 (member peut écrire, pas bloqué)

describe("RBAC viewer (API-06 : lecture seule via RolesGuard — RED)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let ownerCookie: string;
  let memberCookie: string;
  let viewerCookie: string;
  let orgId: string;
  let contactId: string;

  async function signup(label: string): Promise<{ cookie: string; userId: string }> {
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
    const body = (await res.json()) as { user: { id: string } };
    return { cookie: cookieFrom(res), userId: body.user.id };
  }

  beforeAll(async () => {
    app = await bootTestApp();

    // Owner : crée l'org
    const owner = await signup("viewer-owner");
    ownerCookie = owner.cookie;
    const createRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ name: "ViewerOrg", slug: `viewer-org-${Date.now()}` }),
    });
    expect([200, 201]).toContain(createRes.status);
    const org = (await createRes.json()) as { id: string };
    orgId = org.id;
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ organizationId: orgId }),
    });

    // Member : signup + addMember(role:"member") + setActive
    const member = await signup("viewer-member");
    memberCookie = member.cookie;
    await app.auth.api.addMember({
      body: { userId: member.userId, organizationId: orgId, role: "member" },
      headers: new Headers({ cookie: ownerCookie }),
    });
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: memberCookie },
      body: JSON.stringify({ organizationId: orgId }),
    });

    // Viewer : signup + addMember(role:"viewer")
    // Open Question 3 (05-RESEARCH) : Better Auth 1.6.18 peut rejeter role:'viewer'.
    // Fallback : basePrisma.$executeRaw si addMember échoue.
    const viewer = await signup("viewer-user");
    viewerCookie = viewer.cookie;
    try {
      await app.auth.api.addMember({
        // Cast: BA types restrict role to owner/admin/member — 'viewer' is a custom extension.
        // If BA rejects at runtime, the catch block falls back to raw SQL (Open Question 3).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: { userId: viewer.userId, organizationId: orgId, role: "viewer" as any },
        headers: new Headers({ cookie: ownerCookie }),
      });
    } catch {
      // Fallback SQL direct si Better Auth rejette 'viewer' comme valeur custom
      // (comportement non vérifié en BA 1.6.18 — Open Question 3 / Pitfall 6).
      await app.basePrisma.$executeRaw`
        INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt")
        VALUES (
          ${`member-viewer-${Date.now()}`},
          ${orgId},
          ${viewer.userId},
          'viewer',
          NOW()
        )
        ON CONFLICT DO NOTHING
      `;
    }
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: viewerCookie },
      body: JSON.stringify({ organizationId: orgId }),
    });

    // Create a contact for deal writes
    const contactRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ name: "Viewer Test Contact", email: "viewer@test.kessel" }),
    });
    const contact = (await contactRes.json()) as { id: string };
    contactId = contact.id;
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("viewer cookie -> GET /api/deals -> 200 (read allowed)", async () => {
    const res = await fetch(`${app.baseUrl}/api/deals`, {
      headers: { cookie: viewerCookie },
    });
    expect(res.status).toBe(200);
  });

  it("viewer cookie -> POST /api/deals -> 403 (write blocked by RolesGuard)", async () => {
    const res = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: viewerCookie },
      body: JSON.stringify({ title: "Viewer write attempt", contactId, status: "LEAD" }),
    });
    expect(res.status).toBe(403);
  });

  it("viewer cookie -> PATCH /api/deals/:id -> 403 (write blocked by RolesGuard)", async () => {
    // Create a deal as owner first
    const createRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ title: "Owner deal for patch test", contactId, status: "LEAD" }),
    });
    expect(createRes.status).toBe(201);
    const { id: dealId } = (await createRes.json()) as { id: string };

    const res = await fetch(`${app.baseUrl}/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: viewerCookie },
      body: JSON.stringify({ status: "WON" }),
    });
    expect(res.status).toBe(403);
  });

  it("member cookie -> POST /api/deals -> 201 (member can write, not blocked by RolesGuard)", async () => {
    const res = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: memberCookie },
      body: JSON.stringify({ title: "Member write ok", contactId, status: "LEAD" }),
    });
    expect(res.status).toBe(201);
  });
});
