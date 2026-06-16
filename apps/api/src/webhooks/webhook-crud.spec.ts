import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e API-03 — webhook endpoint CRUD (RED specs — plan 05-03 implements).
//
// Prouve :
//  - POST /api/v1/webhooks -> 201, row créé en DB, secret column CHIFFRÉ (format iv:tag:ct hex),
//    response retourne le signing secret en clair UNE seule fois.
//  - URL invalide (non-URL) -> 400.
//  - DELETE /api/v1/webhooks/:id supprime l'endpoint.
//  - Cross-org : org-A key ne peut pas DELETE l'endpoint de org-B -> 404 (pas de fuite).
//  - POST /api/v1/webhooks/deliveries/:id/replay re-POST et incrémente attemptCount.

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

describe("e2e /api/v1/webhooks CRUD (API-03 : create + secret chiffré + delete + replay — RED)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
  let keyA: string;
  let keyB: string;

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

  async function generateApiKey(cookie: string, name = "crud-test-key"): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { key: string }).key;
  }

  beforeAll(async () => {
    app = await bootTestApp();

    cookieA = await signup("crud-A");
    await setupOrg(cookieA, "OrgCrudA");
    keyA = await generateApiKey(cookieA);

    const cookieB = await signup("crud-B");
    await setupOrg(cookieB, "OrgCrudB");
    keyB = await generateApiKey(cookieB, "crud-b-key");
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("POST /api/v1/webhooks -> 201; DB secret is ENCRYPTED (iv:tag:ct hex, not plaintext); response returns plaintext secret once", async () => {
    const res = await fetch(`${app.baseUrl}/api/v1/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${keyA}` },
      body: JSON.stringify({ url: "https://example.com/webhook", events: ["deal.created"] }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; secret: string };
    expect(body.id).toBeTruthy();
    // Response must include the plaintext secret once
    expect(body.secret).toBeTruthy();
    expect(typeof body.secret).toBe("string");

    // DB column must be ENCRYPTED (format: hex:hex:hex — not the raw plaintext)
    const row = await app.basePrisma.webhookEndpoint.findUnique({ where: { id: body.id } });
    expect(row).not.toBeNull();
    // Secret in DB must NOT be the plaintext value
    expect(row?.secret).not.toBe(body.secret);
    // Must match encrypted format: 3 colon-separated hex segments
    expect(row?.secret).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
  });

  it("POST /api/v1/webhooks with invalid URL -> 400", async () => {
    const res = await fetch(`${app.baseUrl}/api/v1/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${keyA}` },
      body: JSON.stringify({ url: "not-a-url", events: ["deal.created"] }),
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/v1/webhooks/:id removes the endpoint", async () => {
    // Create one
    const createRes = await fetch(`${app.baseUrl}/api/v1/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${keyA}` },
      body: JSON.stringify({ url: "https://example.com/delete-test", events: ["deal.created"] }),
    });
    expect(createRes.status).toBe(201);
    const { id } = (await createRes.json()) as { id: string };

    // Delete
    const delRes = await fetch(`${app.baseUrl}/api/v1/webhooks/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${keyA}` },
    });
    expect([200, 204]).toContain(delRes.status);

    // Must be gone from DB
    const row = await app.basePrisma.webhookEndpoint.findUnique({ where: { id } });
    expect(row).toBeNull();
  });

  it("cross-org: org-A key cannot DELETE org-B endpoint -> 404 (no leak)", async () => {
    // Create endpoint under org-B
    const createRes = await fetch(`${app.baseUrl}/api/v1/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${keyB}` },
      body: JSON.stringify({ url: "https://example.com/orgb-endpoint", events: ["deal.created"] }),
    });
    expect(createRes.status).toBe(201);
    const { id: endpointBId } = (await createRes.json()) as { id: string };

    // Attempt delete from org-A key
    const delRes = await fetch(`${app.baseUrl}/api/v1/webhooks/${endpointBId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${keyA}` },
    });
    // Must be 404 — not 403 (anti-enumeration: unknown id looks the same as wrong org)
    expect(delRes.status).toBe(404);

    // Endpoint must still exist in DB
    const row = await app.basePrisma.webhookEndpoint.findUnique({ where: { id: endpointBId } });
    expect(row).not.toBeNull();
  });

  it("POST /api/v1/webhooks/deliveries/:id/replay re-POSTs and increments attemptCount", async () => {
    // Create endpoint + seed a WebhookDelivery row manually (plan 04 will create it via dispatch)
    const createRes = await fetch(`${app.baseUrl}/api/v1/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${keyA}` },
      body: JSON.stringify({ url: "https://example.com/replay-test", events: ["deal.created"] }),
    });
    expect(createRes.status).toBe(201);
    const { id: endpointId } = (await createRes.json()) as { id: string };

    // Seed a delivery row (status FAILED, attemptCount 1)
    const delivery = await app.basePrisma.webhookDelivery.create({
      data: {
        webhookEndpointId: endpointId,
        event: "deal.created",
        payload: { dealId: "test-id", orgId: "org-test", title: "Test", status: "LEAD", createdAt: new Date().toISOString() },
        status: "FAILED",
        attemptCount: 1,
      },
    });

    // Replay
    const replayRes = await fetch(`${app.baseUrl}/api/v1/webhooks/deliveries/${delivery.id}/replay`, {
      method: "POST",
      headers: { Authorization: `Bearer ${keyA}` },
    });
    expect([200, 202]).toContain(replayRes.status);

    // Wait a moment for the async dispatch
    await new Promise((r) => setTimeout(r, 500));

    // attemptCount must be incremented
    const updated = await app.basePrisma.webhookDelivery.findUnique({ where: { id: delivery.id } });
    expect(updated?.attemptCount).toBeGreaterThan(1);
  });
});
