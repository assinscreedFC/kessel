import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e isolation projets cross-org (PROJ-04, T-2-iso) — Postgres RÉEL via bootTestApp, AUCUN mock.
//
// Wave 0 RED : les routes /api/projects n'existent pas encore (Plan 03).
// Ces specs ÉCHOUENT intentionnellement jusqu'au Plan 03 (OrgScopeGuard + forOrg).
//
// Prouve (une fois GREEN) :
//  T-2-iso : GET /api/projects ne renvoie que les projets de l'org courante
//  T-2-iso : GET /api/projects/:id d'une AUTRE org -> 404 (jamais visible)
//  T-2-iso : GET /api/projects/:id/tasks d'une autre org -> 404

const SIGNUP = "/api/auth/sign-up/email";
const CREATE_ORG = "/api/auth/organization/create";
const SET_ACTIVE = "/api/auth/organization/set-active";

const DOC = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Offre." }] }],
};

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

describe("e2e isolation projets cross-org", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookieA: string;
  let cookieB: string;
  let projectAId: string;

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

  async function seedProject(cookie: string): Promise<string> {
    // Crée contact -> deal -> proposition -> signe -> retourne le project.id via DB directe.
    const cRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "Client",
        email: `c+${Date.now()}-${Math.random().toString(36).slice(2)}@x.test`,
      }),
    });
    expect(cRes.status).toBe(201);
    const contact = (await cRes.json()) as { id: string };

    const dRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: "Deal iso", contactId: contact.id, status: "LEAD" }),
    });
    expect(dRes.status).toBe(201);
    const deal = (await dRes.json()) as { id: string };

    const pRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId: deal.id, title: "Prop iso", bodyJson: DOC }),
    });
    expect(pRes.status).toBe(201);
    const proposal = (await pRes.json()) as { id: string };

    await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Item", quantity: 1, unitPrice: 100, position: 0 }),
    });

    const sendRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    expect([200, 201]).toContain(sendRes.status);
    const { token } = (await sendRes.json()) as { token: string };

    await fetch(`${app.baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Bob", signerEmail: "bob@client.test", consent: true }),
    });

    const project = await app.basePrisma.project.findFirst({ where: { proposalId: proposal.id } });
    expect(project).not.toBeNull();
    return project!.id;
  }

  beforeAll(async () => {
    app = await bootTestApp();

    cookieA = await signup("iso-A");
    await setupOrg(cookieA, "OrgIsoA");
    projectAId = await seedProject(cookieA);

    cookieB = await signup("iso-B");
    await setupOrg(cookieB, "OrgIsoB");
    // Org B a aussi un projet (pour vérifier l'isolation de liste)
    await seedProject(cookieB);
  });

  afterAll(async () => { await app?.stop(); });

  it("GET /api/projects ne renvoie que les projets de l'org courante", async () => {
    const res = await fetch(`${app.baseUrl}/api/projects`, {
      headers: { cookie: cookieA },
    });
    expect(res.status).toBe(200);
    const projects = (await res.json()) as { id: string }[];
    // Org A voit uniquement ses propres projets
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects.some((p) => p.id === projectAId)).toBe(true);

    // Le projet Org A ne doit PAS apparaître dans la liste Org B
    const resB = await fetch(`${app.baseUrl}/api/projects`, {
      headers: { cookie: cookieB },
    });
    expect(resB.status).toBe(200);
    const projectsB = (await resB.json()) as { id: string }[];
    expect(projectsB.some((p) => p.id === projectAId)).toBe(false);
  });

  it("GET /api/projects/:id d'une AUTRE org -> 404 (jamais visible)", async () => {
    // Org B essaie d'accéder au projet d'Org A.
    const res = await fetch(`${app.baseUrl}/api/projects/${projectAId}`, {
      headers: { cookie: cookieB },
    });
    expect(res.status).toBe(404);
  });

  it("GET /api/projects/:id/tasks d'une autre org -> 404", async () => {
    // Org B essaie d'accéder aux tâches du projet d'Org A.
    const res = await fetch(`${app.baseUrl}/api/projects/${projectAId}/tasks`, {
      headers: { cookie: cookieB },
    });
    expect(res.status).toBe(404);
  });
});
