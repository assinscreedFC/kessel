import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e API-02 — /api/v1 auth + pagination + cross-org isolation (RED specs — plan 05-02/03 implements).
//
// Prouve :
//  - Pas de Authorization header -> 401 avec enveloppe { success:false, error:{ code, message } }.
//  - Clé valide org-A -> GET /api/v1/deals?page=1&limit=20 -> 200 enveloppe { success, data, meta }.
//  - Clé org-A voit UNIQUEMENT les deals de l'org-A (cross-org isolation).
//  - limit=500 est clampé/rejeté -> meta.limit <= 100 ou 400.
//  - Rate limit : boucle > API_RATE_LIMIT_PER_MIN req/min -> 429 avec Retry-After.

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

describe("e2e /api/v1/deals (API-02 : auth + pagination + cross-org + rate-limit — RED)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let keyA: string;
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

  async function generateApiKey(cookie: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "test-key" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { key: string };
    return body.key;
  }

  beforeAll(async () => {
    // Use a low rate limit for the 429 test (override env before boot)
    process.env.API_RATE_LIMIT_PER_MIN = "5";
    app = await bootTestApp();

    // Org A
    const cookieA = await signup("v1deals-A");
    await setupOrg(cookieA, "OrgV1A");
    keyA = await generateApiKey(cookieA);

    // Org B — create a deal so we can verify cross-org isolation
    const cookieB = await signup("v1deals-B");
    await setupOrg(cookieB, "OrgV1B");
    const contactBRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ name: "Contact B", email: "b@v1.test" }),
    });
    const contactB = (await contactBRes.json()) as { id: string };
    const dealBRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ title: "Deal org-B", contactId: contactB.id, status: "LEAD" }),
    });
    const dealB = (await dealBRes.json()) as { id: string };
    dealBId = dealB.id;
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("no Authorization header -> 401 with { success:false, error:{ code, message } }", async () => {
    const res = await fetch(`${app.baseUrl}/api/v1/deals`);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBeTruthy();
    expect(body.error.message).toBeTruthy();
  });

  it("valid org-A key -> GET /api/v1/deals?page=1&limit=20 -> 200 envelope { success, data, meta }", async () => {
    const res = await fetch(`${app.baseUrl}/api/v1/deals?page=1&limit=20`, {
      headers: { Authorization: `Bearer ${keyA}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: unknown[];
      meta: { total: number; page: number; limit: number };
    };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBeLessThanOrEqual(20);
  });

  it("org-A key does NOT return org-B deal id (cross-org isolation)", async () => {
    const res = await fetch(`${app.baseUrl}/api/v1/deals?limit=100`, {
      headers: { Authorization: `Bearer ${keyA}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ id: string }> };
    const ids = body.data.map((d) => d.id);
    expect(ids).not.toContain(dealBId);
  });

  it("limit=500 -> clamped/rejected (meta.limit <= 100 or 400)", async () => {
    const res = await fetch(`${app.baseUrl}/api/v1/deals?limit=500`, {
      headers: { Authorization: `Bearer ${keyA}` },
    });
    if (res.status === 400) {
      // rejected outright — acceptable
      expect(res.status).toBe(400);
    } else {
      expect(res.status).toBe(200);
      const body = (await res.json()) as { meta: { limit: number } };
      expect(body.meta.limit).toBeLessThanOrEqual(100);
    }
  });

  it("rate limit: > API_RATE_LIMIT_PER_MIN (5) requests -> eventually 429 with Retry-After", async () => {
    // Loop 10 requests (> limit of 5 set in beforeAll)
    let hit429 = false;
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${app.baseUrl}/api/v1/deals`, {
        headers: { Authorization: `Bearer ${keyA}` },
      });
      if (res.status === 429) {
        hit429 = true;
        const retryAfter = res.headers.get("retry-after") ?? res.headers.get("Retry-After");
        expect(retryAfter).toBeTruthy();
        break;
      }
    }
    expect(hit429).toBe(true);
  });
});
