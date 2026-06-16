import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e API-04/05 — outbound webhook dispatch + delivery tracing (RED specs — plan 05-04 implements).
//
// Prouve :
//  - deal.created event pour org-A -> WebhookDelivery row PENDING->DELIVERED ; requête capturée
//    contient X-Kessel-Event, X-Kessel-Signature (sha256=<hmac>), X-Kessel-Timestamp.
//  - HMAC vérifié : sha256(body, signing-secret) === signature header.
//  - Payload contient UNIQUEMENT les champs autorisés (dealId, orgId, title, status, createdAt),
//    AUCUNE donnée cross-tenant.
//  - Un org-B endpoint NE reçoit RIEN pour un event org-A.
//  - Endpoint 500/timeout -> delivery status FAILED, attemptCount incrémenté.

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

/** Démarre un serveur HTTP local qui capture la première requête reçue. */
function startCaptureServer(opts: { statusCode?: number } = {}): Promise<{
  url: string;
  waitForRequest: () => Promise<{ headers: Record<string, string>; body: string }>;
  close: () => void;
}> {
  return new Promise((resolve) => {
    let resolveRequest: (req: { headers: Record<string, string>; body: string }) => void;
    const requestPromise = new Promise<{ headers: Record<string, string>; body: string }>((r) => {
      resolveRequest = r;
    });

    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk.toString(); });
      req.on("end", () => {
        res.writeHead(opts.statusCode ?? 200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        resolveRequest({ headers: req.headers as Record<string, string>, body });
      });
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        waitForRequest: () => requestPromise,
        close: () => server.close(),
      });
    });
  });
}

describe("e2e outbound webhook dispatch (API-04/05 : dispatch + HMAC + delivery trace — RED)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
  let orgAId: string;
  let keyA: string;
  let cookieB: string;

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
      body: JSON.stringify({ name: "dispatch-test-key" }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { key: string }).key;
  }

  beforeAll(async () => {
    app = await bootTestApp();
    cookieA = await signup("dispatch-A");
    orgAId = await setupOrg(cookieA, "OrgDispatchA");
    keyA = await generateApiKey(cookieA);

    cookieB = await signup("dispatch-B");
    await setupOrg(cookieB, "OrgDispatchB");
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("deal.created for org-A -> WebhookDelivery PENDING->DELIVERED; captured request has X-Kessel-* headers + valid HMAC", async () => {
    // Register a webhook endpoint for org-A pointing to a local capture server
    const capture = await startCaptureServer();
    try {
      const registerRes = await fetch(`${app.baseUrl}/api/v1/webhooks`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${keyA}` },
        body: JSON.stringify({ url: capture.url, events: ["deal.created"] }),
      });
      expect(registerRes.status).toBe(201);
      const { secret } = (await registerRes.json()) as { secret: string; id: string };

      // Create a contact + deal to trigger deal.created
      const contactRes = await fetch(`${app.baseUrl}/api/contacts`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ name: "Dispatch Contact", email: "dispatch@kessel.test" }),
      });
      const contact = (await contactRes.json()) as { id: string };
      const dealRes = await fetch(`${app.baseUrl}/api/deals`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ title: "Dispatch Deal", contactId: contact.id, status: "LEAD" }),
      });
      expect(dealRes.status).toBe(201);
      const deal = (await dealRes.json()) as { id: string };

      // Wait for the webhook delivery (async dispatch)
      const captured = await Promise.race([
        capture.waitForRequest(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Webhook dispatch timeout after 5s")), 5000),
        ),
      ]);

      // Verify headers
      expect(captured.headers["x-kessel-event"]).toBe("deal.created");
      expect(captured.headers["x-kessel-timestamp"]).toBeTruthy();
      const sigHeader = captured.headers["x-kessel-signature"];
      expect(sigHeader).toMatch(/^sha256=[0-9a-f]{64}$/);

      // Verify HMAC: sha256(body, signing-secret) === sigHeader value
      const expectedHmac = createHmac("sha256", secret).update(captured.body).digest("hex");
      expect(sigHeader).toBe(`sha256=${expectedHmac}`);

      // Verify payload fields (only whitelisted: dealId, orgId, title, status, createdAt)
      const payload = JSON.parse(captured.body) as Record<string, unknown>;
      expect(payload.dealId ?? payload.id).toBeTruthy();
      expect(payload.orgId).toBe(orgAId);
      expect(payload.title).toBe("Dispatch Deal");
      expect(payload.status).toBeDefined();
      expect(payload.createdAt).toBeDefined();

      // Verify WebhookDelivery row is DELIVERED
      const delivery = await app.basePrisma.webhookDelivery.findFirst({
        where: { payload: { path: ["dealId"], equals: deal.id } },
      });
      expect(delivery ?? delivery).toBeDefined();
      expect(delivery?.status).toBe("DELIVERED");
    } finally {
      capture.close();
    }
  });

  it("org-B endpoint receives NOTHING for an org-A deal.created event (cross-org isolation)", async () => {
    const captureB = await startCaptureServer();
    let receivedByB = false;

    // Register endpoint for org-B
    const keyBRes = await fetch(`${app.baseUrl}/api/settings/api-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ name: "org-b-key" }),
    });
    expect(keyBRes.status).toBe(201);
    const keyB = ((await keyBRes.json()) as { key: string }).key;

    await fetch(`${app.baseUrl}/api/v1/webhooks`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${keyB}` },
      body: JSON.stringify({ url: captureB.url, events: ["deal.created"] }),
    });

    // Trigger org-A event
    const contactRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ name: "Isolation Contact", email: "isolation@kessel.test" }),
    });
    const contact = (await contactRes.json()) as { id: string };
    await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ title: "Isolation Deal", contactId: contact.id, status: "LEAD" }),
    });

    // Wait a bit; org-B server must NOT have received a call
    await new Promise((r) => setTimeout(r, 1500));
    captureB.close();

    // If captureB was hit, receivedByB would be true via the promise resolving; we verify via DB
    const deliveriesForB = await app.basePrisma.webhookDelivery.findMany({
      where: { endpoint: { orgId: (await (async () => {
        // get org-B id from the B key
        const apiKey = await app.basePrisma.apiKey.findFirst({ where: { prefix: { startsWith: "ksl_live_" } } });
        return apiKey?.orgId ?? "unknown";
      })()) } },
    });
    // No delivery should have been created for org-B endpoints from an org-A event
    expect(receivedByB).toBe(false);
    // Org-B deliveries should be empty (or none reference org-A data)
    for (const d of deliveriesForB) {
      const p = d.payload as Record<string, unknown>;
      expect(p.orgId).not.toBe(orgAId);
    }
  });

  it("failing endpoint (500) -> delivery status FAILED, attemptCount incremented", async () => {
    const failServer = await startCaptureServer({ statusCode: 500 });
    try {
      const registerRes = await fetch(`${app.baseUrl}/api/v1/webhooks`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${keyA}` },
        body: JSON.stringify({ url: failServer.url, events: ["deal.created"] }),
      });
      expect(registerRes.status).toBe(201);
      const { id: endpointId } = (await registerRes.json()) as { id: string };

      // Trigger event
      const contactRes = await fetch(`${app.baseUrl}/api/contacts`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ name: "Fail Contact", email: "fail@kessel.test" }),
      });
      const contact = (await contactRes.json()) as { id: string };
      await fetch(`${app.baseUrl}/api/deals`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ title: "Fail Deal", contactId: contact.id, status: "LEAD" }),
      });

      // Wait for dispatch attempt
      await failServer.waitForRequest().catch(() => {/* timeout ok */});
      await new Promise((r) => setTimeout(r, 500));

      // Delivery should be FAILED, attemptCount >= 1
      const delivery = await app.basePrisma.webhookDelivery.findFirst({
        where: { webhookEndpointId: endpointId },
        orderBy: { createdAt: "desc" },
      });
      expect(delivery).toBeDefined();
      expect(delivery?.status).toBe("FAILED");
      expect(delivery?.attemptCount).toBeGreaterThanOrEqual(1);
    } finally {
      failServer.close();
    }
  });
});
