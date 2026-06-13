import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e PDF (PROP-07) — Postgres RÉEL + Chromium RÉEL via test-app.ts, AUCUN mock du PDF (CLAUDE.md :
// ne pas mocker les vraies I/O). bootTestApp boote l'AppModule qui inclut PdfService -> son
// onModuleInit lance Puppeteer (Chromium téléchargé en dev hôte, /usr/bin/chromium en conteneur).
//
// Prouve :
//  - GET /api/proposals/:id/pdf -> 200, Content-Type application/pdf, body non vide commençant par "%PDF"
//    (corps Tiptap rendu via generateHTML + 1 ligne de devis) ;
//  - proposition d'org-B -> GET depuis org-A -> 404 (T-3-pdf-iso : jamais de PDF cross-tenant) ;
//  - proposition SANS ligne -> PDF 200 corps-seul (DEVIS omis).
//
// GATING : en dev hôte, Puppeteer utilise le Chromium qu'il a téléchargé (pas de skip attendu). Si
// l'environnement ne peut PAS lancer Chromium du tout (CI minimal sans browser ET sans
// PUPPETEER_EXECUTABLE_PATH), le boot de l'app échouerait sur onModuleInit — documenté dans le SUMMARY.

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

// Document ProseMirror minimal mais représentatif (heading H1 + paragraphe) — exerce le mapping de
// type partagé éditeur/serveur (generateHTML(PROPOSAL_EXTENSIONS)).
const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Proposition" }] },
    { type: "paragraph", content: [{ type: "text", text: "Bonjour, voici notre offre." }] },
  ],
};

describe("e2e GET /api/proposals/:id/pdf (PROP-07 : 200 application/pdf %PDF, 404 cross-org — real Chromium)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
  let cookieB: string;
  let dealAId: string;
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

  async function createProposal(cookie: string, dealId: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Proposition PDF", bodyJson: DOC }),
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as { id: string };
    return p.id;
  }

  async function addLine(cookie: string, proposalId: string): Promise<void> {
    const res = await fetch(`${app.baseUrl}/api/proposals/${proposalId}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Prestation conseil", quantity: 3, unitPrice: 12.35, position: 0 }),
    });
    expect(res.status).toBe(201);
  }

  beforeAll(async () => {
    app = await bootTestApp();

    cookieA = await signup("pdf-A");
    await setupOrg(cookieA, "OrgPdfA");
    dealAId = await createDeal(cookieA);

    cookieB = await signup("pdf-B");
    await setupOrg(cookieB, "OrgPdfB");
    dealBId = await createDeal(cookieB);
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("GET :id/pdf -> 200 application/pdf, body non vide commençant par %PDF (corps + devis)", async () => {
    const proposalId = await createProposal(cookieA, dealAId);
    await addLine(cookieA, proposalId);

    const res = await fetch(`${app.baseUrl}/api/proposals/${proposalId}/pdf`, { headers: { cookie: cookieA } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBeGreaterThan(1000);
    // Un PDF valide commence par les octets magiques "%PDF".
    expect(body.toString("utf8", 0, 4)).toBe("%PDF");
  });

  it("GET :id/pdf d'org-B depuis org-A -> 404 (T-3-pdf-iso : pas de PDF cross-tenant)", async () => {
    // Proposition créée dans org-B.
    const proposalB = await createProposal(cookieB, dealBId);
    // org-A tente de l'exporter -> la proposition est invisible sous forOrg(org-A) -> 404.
    const res = await fetch(`${app.baseUrl}/api/proposals/${proposalB}/pdf`, { headers: { cookie: cookieA } });
    expect(res.status).toBe(404);
  });

  it("GET :id/pdf sans ligne -> 200 %PDF (corps-seul, DEVIS omis)", async () => {
    const proposalId = await createProposal(cookieA, dealAId);
    const res = await fetch(`${app.baseUrl}/api/proposals/${proposalId}/pdf`, { headers: { cookie: cookieA } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString("utf8", 0, 4)).toBe("%PDF");
  });
});
