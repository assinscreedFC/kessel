import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e DEALS (CRM-02/03) — Postgres RÉEL via test-app.ts, AUCUN mock.
//
// Prouve :
//  - filtre statut CÔTÉ SERVEUR (CRM-03) : GET /api/deals?status=WON ne renvoie que les WON de l'org ;
//  - IDOR fermé (T-2-idor) : POST /api/deals avec un contactId d'une AUTRE org -> 4xx, aucun deal créé ;
//  - DTO rejette une entrée invalide (title vide / status hors enum / amount<0) -> 400 (T-2-input) ;
//  - amount (Decimal) sérialisé en string au boundary (Pitfall 2), jamais un objet.

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

describe("e2e /api/deals (CRM-02/03 : filtre statut, IDOR, DTO, amount string — real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
  let orgAId: string;
  let cookieB: string;
  let contactAId: string; // contact de l'org A (légitime)
  let contactBId: string; // contact de l'org B (cible IDOR)

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
      body: JSON.stringify({ name, slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
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

  async function createContact(cookie: string, email: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Contact", email }),
    });
    expect(res.status).toBe(201);
    const c = (await res.json()) as { id: string };
    return c.id;
  }

  beforeAll(async () => {
    app = await bootTestApp();

    // Org A (sous test) + son contact légitime.
    cookieA = await signup("deal-A");
    orgAId = await setupOrg(cookieA, "OrgA");
    contactAId = await createContact(cookieA, "a@client.test");

    // Org B (org tierce) + son contact — cible de l'attaque IDOR.
    cookieB = await signup("deal-B");
    await setupOrg(cookieB, "OrgB");
    contactBId = await createContact(cookieB, "b@client.test");
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("POST /api/deals title vide / status hors enum / amount<0 -> 400 (T-2-input)", async () => {
    const res = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ title: "", contactId: contactAId, status: "ZZZ", amount: -5 }),
    });
    expect(res.status).toBe(400);
  });

  it("IDOR (T-2-idor) : POST /api/deals avec contactId d'une AUTRE org -> 404, aucun deal créé", async () => {
    const res = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ title: "IDOR attempt", contactId: contactBId, status: "LEAD" }),
    });
    // contactId d'org B est invisible sous forOrg(orgA) -> le service rejette (NotFound -> 404).
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // Garde-fou : AUCUN deal ne pointe vers contactBId dans toute la base (basePrisma, non scopé).
    const leaked = await app.basePrisma.deal.count({ where: { contactId: contactBId } });
    expect(leaked).toBe(0);
  });

  it("POST /api/deals valide -> 201 ; amount renvoyé en string (Pitfall 2)", async () => {
    const res = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({
        title: "Deal chiffré",
        contactId: contactAId,
        status: "PROPOSAL_SENT",
        amount: 1234.56,
      }),
    });
    expect(res.status).toBe(201);
    const deal = (await res.json()) as { id: string; amount: unknown; status: string };
    expect(typeof deal.amount).toBe("string");
    expect(deal.amount).toBe("1234.56");
    expect(deal.status).toBe("PROPOSAL_SENT");
  });

  it("CRM-03 : GET /api/deals?status=WON ne renvoie que les WON de l'org (filtre serveur)", async () => {
    // Seed org A : 1 deal WON + 1 deal LEAD.
    const wonRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ title: "Won deal", contactId: contactAId, status: "WON", amount: 5000 }),
    });
    expect(wonRes.status).toBe(201);
    const leadRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ title: "Lead deal", contactId: contactAId, status: "LEAD" }),
    });
    expect(leadRes.status).toBe(201);

    // GET ?status=WON -> uniquement des WON.
    const filtered = await fetch(`${app.baseUrl}/api/deals?status=WON`, { headers: { cookie: cookieA } });
    expect(filtered.status).toBe(200);
    const wonList = (await filtered.json()) as { status: string }[];
    expect(wonList.length).toBeGreaterThan(0);
    expect(wonList.every((d) => d.status === "WON")).toBe(true);

    // GET sans param -> renvoie plusieurs statuts (au moins le WON ET le LEAD).
    const allRes = await fetch(`${app.baseUrl}/api/deals`, { headers: { cookie: cookieA } });
    expect(allRes.status).toBe(200);
    const all = (await allRes.json()) as { status: string }[];
    const statuses = new Set(all.map((d) => d.status));
    expect(statuses.has("WON")).toBe(true);
    expect(statuses.has("LEAD")).toBe(true);
    expect(all.length).toBeGreaterThan(wonList.length);
  });

  it("GET /api/deals?status=INVALID -> 400 (query DTO @IsEnum)", async () => {
    const res = await fetch(`${app.baseUrl}/api/deals?status=INVALID`, { headers: { cookie: cookieA } });
    expect(res.status).toBe(400);
  });
});
