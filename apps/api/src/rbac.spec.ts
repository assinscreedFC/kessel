import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "./test-app";

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
