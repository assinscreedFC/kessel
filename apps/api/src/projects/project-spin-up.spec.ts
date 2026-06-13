import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e spin-up projet (PROJ-01/02/03) — Postgres RÉEL via bootTestApp, AUCUN mock.
//
// Wave 0 RED : les routes /api/projects n'existent pas encore (Plan 03).
// Ces specs ÉCHOUENT intentionnellement jusqu'au Plan 03 (backend endpoints + $transaction).
//
// Prouve (une fois GREEN) :
//  PROJ-01 : signer une proposition crée exactement 1 projet (même orgId, proposalId @unique)
//  PROJ-02 : budgetSnapshot.total = grandTotal exact du devis (2 décimales) ; snapshot immuable
//  PROJ-03 : devis à N lignes → exactement N Task (title=description, position, done=false)

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";

const DOC = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Offre projet." }] }],
};

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

describe("e2e spin-up projet (real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
  let resetThrottle: () => void;

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

  async function createContact(cookie: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "Client",
        email: `c+${Date.now()}-${Math.random().toString(36).slice(2)}@x.test`,
      }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  async function createDeal(cookie: string, contactId: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Deal projet", contactId, status: "LEAD" }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  async function createProposal(cookie: string, dealId: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Proposition", bodyJson: DOC }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  async function addLine(
    cookie: string,
    proposalId: string,
    description: string,
    quantity: number,
    unitPrice: number,
    position: number,
  ): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/proposals/${proposalId}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description, quantity, unitPrice, position }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { lines: { id: string }[] };
    return body.lines[body.lines.length - 1].id;
  }

  async function send(cookie: string, proposalId: string): Promise<string> {
    const res = await fetch(`${app.baseUrl}/api/proposals/${proposalId}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    expect([200, 201]).toContain(res.status);
    return ((await res.json()) as { token: string }).token;
  }

  async function sign(token: string): Promise<Response> {
    return fetch(`${app.baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        signerName: "Alice",
        signerEmail: "alice@client.test",
        consent: true,
      }),
    });
  }

  beforeAll(async () => {
    app = await bootTestApp();

    const { getStorageToken } = await import("@nestjs/throttler");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const throttlerStorage = (app as any)._nestApp?.get?.(getStorageToken(), { strict: false }) as {
      storage?: Map<string, unknown>;
    } | undefined;
    resetThrottle = () => { throttlerStorage?.storage?.clear(); };

    cookieA = await signup("spinup-A");
    await setupOrg(cookieA, "OrgSpinupA");
  });

  beforeEach(() => { resetThrottle?.(); });

  afterAll(async () => { await app?.stop(); });

  it("signer une proposition crée exactement 1 projet (même orgId, proposalId du devis)", async () => {
    const contactId = await createContact(cookieA);
    const dealId = await createDeal(cookieA, contactId);
    const proposalId = await createProposal(cookieA, dealId);
    await addLine(cookieA, proposalId, "Prestation", 1, 500, 0);
    const token = await send(cookieA, proposalId);
    const signRes = await sign(token);
    expect(signRes.status).toBe(200);

    // Plan 03 créera GET /api/projects — cette assertion sera GREEN à ce moment-là.
    const listRes = await fetch(`${app.baseUrl}/api/projects`, {
      headers: { cookie: cookieA },
    });
    expect(listRes.status).toBe(200);
    const projects = (await listRes.json()) as { id: string; dealId: string }[];
    const matching = projects.filter((p) => p.dealId === dealId);
    expect(matching).toHaveLength(1);
  });

  it("signer 2× -> 409 et toujours 1 seul projet (idempotence, proposalId @unique)", async () => {
    const contactId = await createContact(cookieA);
    const dealId = await createDeal(cookieA, contactId);
    const proposalId = await createProposal(cookieA, dealId);
    await addLine(cookieA, proposalId, "Audit", 1, 200, 0);
    const token = await send(cookieA, proposalId);

    const first = await sign(token);
    expect(first.status).toBe(200);

    const second = await sign(token);
    // Idempotence : déjà signé -> 200 alreadySigned=true OR 409 selon impl Plan 03 spin-up
    expect([200, 409]).toContain(second.status);

    const count = await app.basePrisma.project.count({ where: { proposalId } });
    expect(count).toBe(1);
  });

  it("budgetSnapshot.total = grandTotal exact du devis (2 décimales)", async () => {
    const contactId = await createContact(cookieA);
    const dealId = await createDeal(cookieA, contactId);
    const proposalId = await createProposal(cookieA, dealId);
    // 3 × 100 = 300 + 2 × 75 = 150 -> total = 450.00
    await addLine(cookieA, proposalId, "Dev", 3, 100, 0);
    await addLine(cookieA, proposalId, "Design", 2, 75, 1);
    const token = await send(cookieA, proposalId);
    await sign(token);

    const project = await app.basePrisma.project.findFirst({ where: { proposalId } });
    expect(project).not.toBeNull();
    const snap = project!.budgetSnapshot as { total: string };
    expect(snap.total).toBe("450.00");
  });

  it("budgetSnapshot inchangé après mutation d'une QuoteLine post-signature", async () => {
    const contactId = await createContact(cookieA);
    const dealId = await createDeal(cookieA, contactId);
    const proposalId = await createProposal(cookieA, dealId);
    const lineId = await addLine(cookieA, proposalId, "Ligne", 2, 50, 0);
    const token = await send(cookieA, proposalId);
    await sign(token);

    const before = await app.basePrisma.project.findFirst({ where: { proposalId } });
    const snapBefore = before!.budgetSnapshot as { total: string };
    expect(snapBefore.total).toBe("100.00");

    // Muter la QuoteLine après signature (quantity 2 -> 100).
    await fetch(`${app.baseUrl}/api/proposals/${proposalId}/lines/${lineId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ quantity: 100 }),
    });

    // Le snapshot du projet ne doit PAS avoir changé.
    const after = await app.basePrisma.project.findFirst({ where: { proposalId } });
    const snapAfter = after!.budgetSnapshot as { total: string };
    expect(snapAfter.total).toBe("100.00");
  });

  it("devis à 3 lignes -> exactement 3 Task (title=description, position=ordre, done=false) via GET /api/projects/:id/tasks", async () => {
    const contactId = await createContact(cookieA);
    const dealId = await createDeal(cookieA, contactId);
    const proposalId = await createProposal(cookieA, dealId);
    await addLine(cookieA, proposalId, "Phase 1", 1, 100, 0);
    await addLine(cookieA, proposalId, "Phase 2", 1, 200, 1);
    await addLine(cookieA, proposalId, "Phase 3", 1, 300, 2);
    const token = await send(cookieA, proposalId);
    await sign(token);

    const project = await app.basePrisma.project.findFirst({ where: { proposalId } });
    expect(project).not.toBeNull();

    const tasksRes = await fetch(`${app.baseUrl}/api/projects/${project!.id}/tasks`, {
      headers: { cookie: cookieA },
    });
    expect(tasksRes.status).toBe(200);
    const tasks = (await tasksRes.json()) as { title: string; position: number; done: boolean }[];
    expect(tasks).toHaveLength(3);
    expect(tasks.every((t) => t.done === false)).toBe(true);
    const titles = tasks.sort((a, b) => a.position - b.position).map((t) => t.title);
    expect(titles).toEqual(["Phase 1", "Phase 2", "Phase 3"]);
  });
});
