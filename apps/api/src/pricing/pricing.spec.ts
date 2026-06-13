import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e PRICING (PROP-03, grille de tarifs) — Postgres RÉEL. Exerce /api/pricing-items (path réel Caddy).
//
// Prouve :
//  - CRUD : create/get/patch/delete round-trip, unitPrice Decimal->string au boundary ;
//  - DTO invalides (T-3-input) : name vide / unitPrice<0 -> 400 ;
//  - isolation cross-tenant (T-3-iso) : un pricing item d'org-B n'apparaît pas dans la liste d'org-A.

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

describe("e2e /api/pricing-items (PROP-03 : CRUD, DTO 400, isolation — real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
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

  async function setupOrg(cookie: string, name: string): Promise<void> {
    const createRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name, slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
    });
    const org = (await createRes.json()) as { id: string };
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ organizationId: org.id }),
    });
  }

  beforeAll(async () => {
    app = await bootTestApp();
    cookieA = await signup("price-A");
    await setupOrg(cookieA, "OrgPriceA");
    cookieB = await signup("price-B");
    await setupOrg(cookieB, "OrgPriceB");
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("CRUD round-trip + unitPrice string au boundary", async () => {
    const createRes = await fetch(`${app.baseUrl}/api/pricing-items`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ name: "Jour de design", unitPrice: 450, unit: "jour" }),
    });
    expect(createRes.status).toBe(201);
    const item = (await createRes.json()) as { id: string; unitPrice: unknown; unit: string | null };
    expect(typeof item.unitPrice).toBe("string");
    expect(item.unit).toBe("jour");

    const getRes = await fetch(`${app.baseUrl}/api/pricing-items/${item.id}`, { headers: { cookie: cookieA } });
    expect(getRes.status).toBe(200);

    const patchRes = await fetch(`${app.baseUrl}/api/pricing-items/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ unitPrice: 500 }),
    });
    expect(patchRes.status).toBe(200);
    expect(Number(((await patchRes.json()) as { unitPrice: string }).unitPrice)).toBe(500);

    const delRes = await fetch(`${app.baseUrl}/api/pricing-items/${item.id}`, { method: "DELETE", headers: { cookie: cookieA } });
    expect(delRes.status).toBe(200);
  });

  it("T-3-input : name vide / unitPrice<0 -> 400", async () => {
    const emptyName = await fetch(`${app.baseUrl}/api/pricing-items`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ name: "", unitPrice: 10 }),
    });
    expect(emptyName.status).toBe(400);

    const negative = await fetch(`${app.baseUrl}/api/pricing-items`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ name: "X", unitPrice: -1 }),
    });
    expect(negative.status).toBe(400);
  });

  it("T-3-iso : un pricing item d'org-B n'apparaît pas dans la liste d'org-A", async () => {
    const bRes = await fetch(`${app.baseUrl}/api/pricing-items`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ name: "Secret B", unitPrice: 999 }),
    });
    expect(bRes.status).toBe(201);
    const bItem = (await bRes.json()) as { id: string };

    const listA = await fetch(`${app.baseUrl}/api/pricing-items`, { headers: { cookie: cookieA } });
    const itemsA = (await listA.json()) as { id: string; name: string }[];
    expect(itemsA.some((i) => i.id === bItem.id)).toBe(false);
    expect(itemsA.some((i) => i.name === "Secret B")).toBe(false);

    // Accès direct au pricing item d'org B depuis org A -> invisible (null/404).
    const getCross = await fetch(`${app.baseUrl}/api/pricing-items/${bItem.id}`, { headers: { cookie: cookieA } });
    const body = await getCross.text();
    expect(body === "" || body === "null" || getCross.status === 404).toBe(true);
  });
});
