import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e PROPOSALS (PROP-01/02/03) — Postgres RÉEL via test-app.ts, AUCUN mock. Exerce le PATH RÉEL
// /api/proposals (anti-404 Caddy, Pitfall 1).
//
// Prouve :
//  - CRUD : create/get/patch/delete round-trip ; status DRAFT, lines [], grandTotal "0.00" à la création ;
//  - create-from-template (PROP-02) : le bodyJson de la proposition === bodyJson du template (copie serveur) ;
//  - IDOR (T-3-idor) : templateId d'org-B -> 404 + 0 proposition créée ; dealId d'org-B -> 404 ;
//  - total decimal (T-3-math) : 3×12.35 + 1×0.10 = "37.15" (pas de dérive float), grandTotal typeof string ;
//  - DTO invalides (T-3-input) : title vide / bodyJson non-objet / unitPrice<0 -> 400.

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

const DOC = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bonjour" }] }] };

describe("e2e /api/proposals (PROP-01/02/03 : CRUD, from-template, IDOR, total decimal — real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
  let cookieB: string;
  let dealAId: string;
  let dealBId: string;
  let templateAId: string;
  let templateBId: string;

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

  // Une proposition se rattache à un deal -> il faut un contact puis un deal.
  async function createDeal(cookie: string): Promise<string> {
    const cRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Client", email: `c+${Date.now()}-${Math.random().toString(36).slice(2)}@x.test` }),
    });
    expect(cRes.status).toBe(201);
    const contact = (await cRes.json()) as { id: string };
    const dRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Deal", contactId: contact.id, status: "LEAD" }),
    });
    expect(dRes.status).toBe(201);
    const deal = (await dRes.json()) as { id: string };
    return deal.id;
  }

  async function createTemplate(cookie: string, name: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/templates`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name, bodyJson: DOC }),
    });
    expect(res.status).toBe(201);
    const tpl = (await res.json()) as { id: string };
    return tpl.id;
  }

  beforeAll(async () => {
    app = await bootTestApp();

    cookieA = await signup("prop-A");
    await setupOrg(cookieA, "OrgPropA");
    dealAId = await createDeal(cookieA);
    templateAId = await createTemplate(cookieA, "Template A");

    cookieB = await signup("prop-B");
    await setupOrg(cookieB, "OrgPropB");
    dealBId = await createDeal(cookieB);
    templateBId = await createTemplate(cookieB, "Template B");
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("POST /api/proposals -> 201, status DRAFT, lines [], grandTotal '0.00'", async () => {
    const res = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, title: "Ma proposition", bodyJson: DOC }),
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as { id: string; status: string; lines: unknown[]; grandTotal: string };
    expect(p.status).toBe("DRAFT");
    expect(p.lines).toEqual([]);
    expect(p.grandTotal).toBe("0.00");
    expect(typeof p.grandTotal).toBe("string");
  });

  it("CRUD round-trip : GET, PATCH (title+bodyJson), DELETE", async () => {
    const createRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, title: "À éditer", bodyJson: DOC }),
    });
    const created = (await createRes.json()) as { id: string };

    const getRes = await fetch(`${app.baseUrl}/api/proposals/${created.id}`, { headers: { cookie: cookieA } });
    expect(getRes.status).toBe(200);

    const newDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Modifié" }] }] };
    const patchRes = await fetch(`${app.baseUrl}/api/proposals/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ title: "Titre modifié", bodyJson: newDoc }),
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()) as { title: string; bodyJson: typeof newDoc };
    expect(patched.title).toBe("Titre modifié");
    expect(patched.bodyJson).toEqual(newDoc);

    const delRes = await fetch(`${app.baseUrl}/api/proposals/${created.id}`, { method: "DELETE", headers: { cookie: cookieA } });
    expect(delRes.status).toBe(200);
  });

  it("PROP-02 : POST /api/proposals/from-template copie le bodyJson du template", async () => {
    const res = await fetch(`${app.baseUrl}/api/proposals/from-template`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ templateId: templateAId, dealId: dealAId, title: "Depuis template" }),
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as { bodyJson: typeof DOC; title: string };
    // Le serveur a copié le bodyJson du template (le client ne l'a jamais envoyé).
    expect(p.bodyJson).toEqual(DOC);
    expect(p.title).toBe("Depuis template");
  });

  it("IDOR (T-3-idor) : templateId d'org-B -> 404 + 0 proposition créée", async () => {
    const before = await app.basePrisma.proposal.count();
    const res = await fetch(`${app.baseUrl}/api/proposals/from-template`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ templateId: templateBId, dealId: dealAId, title: "Vol template" }),
    });
    expect(res.status).toBe(404);
    const after = await app.basePrisma.proposal.count();
    expect(after).toBe(before);
  });

  it("IDOR (T-3-idor) : dealId d'org-B -> 404", async () => {
    const res = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealBId, title: "Vol deal", bodyJson: DOC }),
    });
    expect(res.status).toBe(404);
  });

  it("T-3-math : 2 lignes (3×12.35 + 1×0.10) -> grandTotal '37.15' (decimal exact, string)", async () => {
    const createRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, title: "Devis chiffré", bodyJson: DOC }),
    });
    const proposal = (await createRes.json()) as { id: string };

    const line1 = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ description: "Prestation A", quantity: 3, unitPrice: 12.35, position: 0 }),
    });
    expect(line1.status).toBe(201);
    const line2 = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ description: "Prestation B", quantity: 1, unitPrice: 0.1, position: 1 }),
    });
    expect(line2.status).toBe(201);

    const getRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}`, { headers: { cookie: cookieA } });
    const full = (await getRes.json()) as {
      grandTotal: string;
      lines: { lineTotal: string; quantity: string; unitPrice: string }[];
    };
    expect(typeof full.grandTotal).toBe("string");
    expect(full.grandTotal).toBe("37.15");
    expect(full.lines).toHaveLength(2);
    expect(full.lines[0].lineTotal).toBe("37.05");
    expect(full.lines[1].lineTotal).toBe("0.10");
    // Chaque montant est une string (Decimal->string au boundary).
    expect(typeof full.lines[0].quantity).toBe("string");
    expect(typeof full.lines[0].unitPrice).toBe("string");
  });

  it("T-3-input : DTO invalides -> 400 (title vide / bodyJson non-objet)", async () => {
    const emptyTitle = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, title: "", bodyJson: DOC }),
    });
    expect(emptyTitle.status).toBe(400);

    const badBody = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, title: "OK", bodyJson: "pas-un-objet" }),
    });
    expect(badBody.status).toBe(400);
  });

  it("T-3-input : ligne unitPrice<0 -> 400", async () => {
    const createRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, title: "Ligne invalide", bodyJson: DOC }),
    });
    const proposal = (await createRes.json()) as { id: string };
    const res = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ description: "X", quantity: 1, unitPrice: -5, position: 0 }),
    });
    expect(res.status).toBe(400);
  });

  // TVA-02/03/04 : vatTotals calculé serveur (NORMAL 3×33.33@0.20 → ht 99.99/tva 20.00/ttc 119.99)
  it("TVA-02/03 : org NORMAL, 3 lignes 33.33@0.20 -> vatTotals ht:99.99 tva:[{20,20.00}] ttc:119.99", async () => {
    // org-A créée dans beforeAll avec vatRegime NORMAL par défaut (Prisma @default)
    const createRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, title: "Devis TVA", bodyJson: DOC }),
    });
    expect(createRes.status).toBe(201);
    const proposal = (await createRes.json()) as { id: string };

    // Ajouter 3 lignes 33.33€ @20%
    for (let i = 0; i < 3; i++) {
      const lineRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieA },
        body: JSON.stringify({ description: `Ligne ${i + 1}`, quantity: 1, unitPrice: 33.33, vatRate: 0.20, position: i }),
      });
      expect(lineRes.status).toBe(201);
    }

    const getRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}`, { headers: { cookie: cookieA } });
    expect(getRes.status).toBe(200);
    const full = (await getRes.json()) as {
      vatTotals: { ht: string; tva: { rate: number; amount: string }[]; ttc: string; regime: string; legalMention: string | null };
    };

    expect(full.vatTotals.ht).toBe("99.99");
    expect(full.vatTotals.tva).toEqual([{ rate: 20, amount: "20.00" }]);
    expect(full.vatTotals.ttc).toBe("119.99");
    expect(full.vatTotals.regime).toBe("NORMAL");
    expect(full.vatTotals.legalMention).toBeNull();
  });

  // TVA-04 : régime FRANCHISE → mention Art.293B, tva:[]
  it("TVA-04 : org FRANCHISE -> vatTotals.legalMention = 'Article 293B du CGI — TVA non applicable', tva:[]", async () => {
    // Mettre l'org-A en FRANCHISE via SQL direct (PATCH /orgs/me/settings n'existe pas encore en Plan 03)
    await app.basePrisma.$executeRawUnsafe(
      `UPDATE organization SET "vatRegime" = 'FRANCHISE' WHERE id = (
        SELECT "activeOrganizationId" FROM session WHERE token = (
          SELECT value FROM session WHERE token IS NOT NULL LIMIT 1
        ) LIMIT 1
      )`,
    ).catch(() => {
      // Fallback : trouver l'org-A directement par son nom
    });

    // Approche directe : lire l'orgId depuis la session puis mettre à jour
    const sessRes = await fetch(`${app.baseUrl}/api/auth/get-session`, { headers: { cookie: cookieA } });
    const sess = (await sessRes.json()) as { session?: { activeOrganizationId?: string } };
    const orgAId = sess.session?.activeOrganizationId;
    if (orgAId) {
      await app.basePrisma.$executeRawUnsafe(
        `UPDATE organization SET "vatRegime" = 'FRANCHISE' WHERE id = $1`,
        orgAId,
      );
    }

    const createRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ dealId: dealAId, title: "Devis Franchise", bodyJson: DOC }),
    });
    expect(createRes.status).toBe(201);
    const proposal = (await createRes.json()) as { id: string };

    const lineRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ description: "Prestation", quantity: 1, unitPrice: 100, vatRate: 0.20, position: 0 }),
    });
    expect(lineRes.status).toBe(201);

    const getRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}`, { headers: { cookie: cookieA } });
    expect(getRes.status).toBe(200);
    const full = (await getRes.json()) as {
      vatTotals: { tva: unknown[]; legalMention: string | null; ttc: string; ht: string };
    };

    expect(full.vatTotals.tva).toEqual([]);
    expect(full.vatTotals.legalMention).toBe("Article 293B du CGI — TVA non applicable");
    expect(full.vatTotals.ttc).toBe(full.vatTotals.ht);

    // Remettre l'org en NORMAL pour ne pas affecter les autres tests
    if (orgAId) {
      await app.basePrisma.$executeRawUnsafe(
        `UPDATE organization SET "vatRegime" = 'NORMAL' WHERE id = $1`,
        orgAId,
      );
    }
  });
});
