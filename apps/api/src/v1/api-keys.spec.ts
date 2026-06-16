import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e API-01 — API key generate / revoke (RED specs — plan 05-02 implements).
//
// Prouve :
//  - POST /api/settings/api-keys (session cookie) génère une clé format ksl_live_<32hex>,
//    retourne la clé en clair UNE seule fois + prefix ksl_live_<8hex>.
//  - GET /api/settings/api-keys ne renvoie JAMAIS la clé brute (seulement prefix/name/status).
//  - La clé brute authentifie GET /api/v1/deals (Authorization: Bearer) -> 200.
//  - DELETE /api/settings/api-keys/:id révoque ; la même clé -> 401 immédiat.
//  - Clé inconnue/absente -> 401 uniforme (anti-énumération, cross-org placeholder).

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

describe("e2e /api/settings/api-keys (API-01 : generate + revoke + anti-énumération — RED)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;

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
    cookieA = await signup("apikey-A");
    await setupOrg(cookieA, "OrgApiKeyA");
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("POST /api/settings/api-keys -> 201, body.key matches /^ksl_live_[0-9a-f]{32}$/, body.prefix is ksl_live_ + 8 hex", async () => {
    const res = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ name: "My integration key" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string; prefix: string; id: string };
    expect(body.key).toMatch(/^ksl_live_[0-9a-f]{32}$/);
    expect(body.prefix).toMatch(/^ksl_live_[0-9a-f]{8}$/);
    expect(body.id).toBeTruthy();
  });

  it("GET /api/settings/api-keys never returns the raw key (only prefix/name/status)", async () => {
    // Generate a key first
    const genRes = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ name: "List-test key" }),
    });
    expect(genRes.status).toBe(201);
    const { key } = (await genRes.json()) as { key: string };

    // List must not expose the raw key
    const listRes = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      headers: { cookie: cookieA },
    });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ key?: string; prefix: string; name: string }>;
    // The raw key must not appear in any item
    for (const item of list) {
      expect(item.key).toBeUndefined();
      expect(JSON.stringify(item)).not.toContain(key);
    }
  });

  it("generated key authenticates GET /api/v1/deals via Authorization: Bearer -> 200", async () => {
    const genRes = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ name: "Auth-test key" }),
    });
    expect(genRes.status).toBe(201);
    const { key } = (await genRes.json()) as { key: string };

    const dealsRes = await fetch(`${app.baseUrl}/api/v1/deals`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(dealsRes.status).toBe(200);
  });

  it("DELETE /api/settings/api-keys/:id revokes; same key on GET /api/v1/deals -> 401", async () => {
    const genRes = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ name: "Revoke-test key" }),
    });
    expect(genRes.status).toBe(201);
    const { key, id } = (await genRes.json()) as { key: string; id: string };

    // Revoke
    const revokeRes = await fetch(`${app.baseUrl}/api/settings/api-keys/${id}`, {
      method: "DELETE",
      headers: { cookie: cookieA },
    });
    expect([200, 204]).toContain(revokeRes.status);

    // Key should now 401
    const afterRevoke = await fetch(`${app.baseUrl}/api/v1/deals`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(afterRevoke.status).toBe(401);
  });

  it("unknown/missing key -> 401 uniform (anti-énumération, no leak)", async () => {
    // No key at all
    const noKey = await fetch(`${app.baseUrl}/api/v1/deals`);
    expect(noKey.status).toBe(401);
    const noKeyBody = (await noKey.json()) as { success: boolean; error: { code: string; message: string } };
    expect(noKeyBody.success).toBe(false);
    expect(noKeyBody.error).toBeDefined();

    // Wrong key (not matching any org)
    const wrongKey = await fetch(`${app.baseUrl}/api/v1/deals`, {
      headers: { Authorization: "Bearer ksl_live_deadbeefdeadbeefdeadbeefdeadbeef" },
    });
    expect(wrongKey.status).toBe(401);
  });
});
