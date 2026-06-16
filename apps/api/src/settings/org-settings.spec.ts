import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// RED — e2e PATCH /api/orgs/me/settings (TVA-01, TVA-05, I18N-01).
// L'endpoint N'EXISTE PAS encore (Wave 1, Plan 02) → ces tests DOIVENT échouer (404/405 attendu).
// Le helper bootTestApp + Testcontainers Postgres réel est réutilisé (pattern proposals.spec.ts).
//
// Prouve :
//  - owner PATCH vatRegime/vatNumber/country/defaultLocale → 200 et persiste (relecture org)
//  - vatNumber invalide → 400 (message localisé via nestjs-i18n — Plan 02 branche le pipe)
//  - member non-owner → 403 (RBAC @OrgRoles(["owner"]) — T-7-01 STRIDE Elevation of Privilege)
//
// Cap --maxWorkers=3 + purge Docker après suite (MEMORY.md).

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";
const MEMBER_ROLE_URL = "/api/auth/organization/add-member";

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

describe("e2e /api/orgs/me/settings (TVA-01/05 : PATCH vatRegime, vatNumber invalide, RBAC member — real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let ownerCookie: string;
  let memberCookie: string;
  let orgId: string;

  beforeAll(async () => {
    app = await bootTestApp();

    // Créer l'owner + l'org
    ownerCookie = await signup(app.baseUrl, "settings-owner");
    const createRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({
        name: "SettingsOrg",
        slug: `settings-org-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    });
    expect([200, 201]).toContain(createRes.status);
    const org = (await createRes.json()) as { id: string };
    orgId = org.id;
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ organizationId: orgId }),
    });

    // Créer un member (non-owner) dans la même org
    memberCookie = await signup(app.baseUrl, "settings-member");
    // Inviter le member via Better Auth — pattern: owner invite, member accepte
    // Simplifié : on utilise l'API Better Auth directement pour ajouter le member
    await fetch(`${app.baseUrl}${MEMBER_ROLE_URL}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({
        organizationId: orgId,
        email: `settings-member+${Date.now()}@kessel.test`,
        role: "member",
      }),
    });
    // Activer l'org pour le member (même si invite simplifiée)
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: memberCookie },
      body: JSON.stringify({ organizationId: orgId }),
    });
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("owner PATCH /api/orgs/me/settings { vatRegime, vatNumber, country, defaultLocale } → 200 et persiste", async () => {
    // Act — RED : route inexistante → 404 attendu
    const res = await fetch(`${app.baseUrl}/api/orgs/me/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({
        vatRegime: "FRANCHISE",
        vatNumber: "FR12345678901",
        country: "FR",
        defaultLocale: "en",
      }),
    });
    // GREEN attendu : 200
    expect(res.status).toBe(200);

    // Vérifier la persistance via relecture
    const getRes = await fetch(`${app.baseUrl}/api/orgs/me/settings`, {
      method: "GET",
      headers: { cookie: ownerCookie },
    });
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as {
      vatRegime: string;
      vatNumber: string;
      country: string;
      defaultLocale: string;
    };
    expect(body.vatRegime).toBe("FRANCHISE");
    expect(body.vatNumber).toBe("FR12345678901");
    expect(body.country).toBe("FR");
    expect(body.defaultLocale).toBe("en");
  });

  it("owner PATCH avec vatNumber invalide ('XX000') → 400 (validation jsvat-next)", async () => {
    // Act — RED : route inexistante OU validateur absent
    const res = await fetch(`${app.baseUrl}/api/orgs/me/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({
        vatNumber: "XX000",
      }),
    });
    // GREEN attendu : 400
    expect(res.status).toBe(400);
  });

  it("member non-owner PATCH /api/orgs/me/settings → 403 (RBAC @OrgRoles owner-only)", async () => {
    // Act — RED : route inexistante → 404 ; GREEN attendu : 403
    const res = await fetch(`${app.baseUrl}/api/orgs/me/settings`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: memberCookie },
      body: JSON.stringify({ vatRegime: "NORMAL" }),
    });
    // GREEN attendu : 403
    expect(res.status).toBe(403);
  });
});
