import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e SNAPSHOT (PROP-03, T-3-snapshot) — Postgres RÉEL. L'INVARIANT le plus important de la phase :
// modifier un PricingItem ne change JAMAIS une QuoteLine déjà créée (aucune FK vers PricingItem).
//
// Scénario : créer PricingItem(100) -> addQuoteLine en copiant (100) -> PATCH PricingItem (200)
// -> re-GET la proposition -> la QuoteLine garde unitPrice "100.00" et lineTotal sur 100, pas 200.

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

const DOC = { type: "doc", content: [{ type: "paragraph" }] };

describe("e2e snapshot QuoteLine (PROP-03 : modifier la grille ne mute pas un devis — real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookie: string;
  let dealId: string;

  beforeAll(async () => {
    app = await bootTestApp();

    const su = await fetch(`${app.baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `snap+${Date.now()}@kessel.test`, password: "Sup3r-Secret-Pw!", name: "snap" }),
    });
    cookie = cookieFrom(su);
    const orgRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "OrgSnap", slug: `orgsnap-${Date.now()}` }),
    });
    const org = (await orgRes.json()) as { id: string };
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ organizationId: org.id }),
    });

    const cRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Client", email: `snapc+${Date.now()}@x.test` }),
    });
    const contact = (await cRes.json()) as { id: string };
    const dRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Deal", contactId: contact.id, status: "LEAD" }),
    });
    dealId = ((await dRes.json()) as { id: string }).id;
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("PATCH PricingItem 100->200 ne change PAS la QuoteLine déjà créée (invariant snapshot, pas de FK)", async () => {
    // 1. Grille : PricingItem à 100.00.
    const piRes = await fetch(`${app.baseUrl}/api/pricing-items`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Jour de dev", unitPrice: 100, unit: "jour" }),
    });
    expect(piRes.status).toBe(201);
    const pricingItem = (await piRes.json()) as { id: string; unitPrice: string };
    expect(pricingItem.unitPrice).toBe("100");

    // 2. Proposition + QuoteLine snapshot copiant unitPrice 100 depuis la grille.
    const propRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Devis snapshot", bodyJson: DOC }),
    });
    const proposal = (await propRes.json()) as { id: string };
    const lineRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Jour de dev", quantity: 2, unitPrice: 100, position: 0 }),
    });
    expect(lineRes.status).toBe(201);

    // 3. La grille évolue : PricingItem passe à 200.00.
    const patchRes = await fetch(`${app.baseUrl}/api/pricing-items/${pricingItem.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ unitPrice: 200 }),
    });
    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()) as { unitPrice: string }).unitPrice).toBe("200");

    // 4. INVARIANT : la QuoteLine garde 100 (snapshot, aucune FK) — lineTotal sur 100, pas 200.
    const getRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}`, { headers: { cookie } });
    const full = (await getRes.json()) as {
      grandTotal: string;
      lines: { unitPrice: string; lineTotal: string }[];
    };
    expect(full.lines).toHaveLength(1);
    // unitPrice = Decimal.toString() (snapshot copié = 100, JAMAIS 200).
    expect(Number(full.lines[0].unitPrice)).toBe(100);
    // lineTotal = money.ts toFixed(2) sur 100 (2 × 100), PAS 2 × 200.
    expect(full.lines[0].lineTotal).toBe("200.00");
    expect(full.grandTotal).toBe("200.00");
  });
});
