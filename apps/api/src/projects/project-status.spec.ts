import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e statut + tâches (PROJ-05, T-2-transition, T-2-iso tâche) — Postgres RÉEL via bootTestApp.
//
// Wave 0 RED : les routes /api/projects/:id (PATCH statut) et /api/tasks/:id n'existent pas encore.
// Ces specs ÉCHOUENT intentionnellement jusqu'au Plan 03 (backend endpoints + transitions).
//
// Prouve (une fois GREEN) :
//  PROJ-05 : PATCH /api/projects/:id ACTIVE->COMPLETED -> 200, statut persisté
//  T-2-transition : PATCH /api/projects/:id COMPLETED->ACTIVE -> 409 (sans retour arrière)
//  T-2-transition : PATCH /api/projects/:id ACTIVE-><invalide> -> 400
//  PROJ-05 : PATCH /api/tasks/:id done=true sur projet ACTIVE -> 200
//  T-2-iso  : PATCH /api/tasks/:id d'un projet d'une AUTRE org -> 404 (IDOR via parent)
//  PROJ-05 : PATCH /api/tasks/:id sur projet CANCELLED/COMPLETED -> 409

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

describe("e2e statut + tâches", () => {
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

  /** Signe une proposition avec 1 ligne et retourne { projectId, taskId }. */
  async function seedSignedProject(cookie: string): Promise<{ projectId: string; taskId: string }> {
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
      body: JSON.stringify({ title: "Deal status", contactId: contact.id, status: "LEAD" }),
    });
    expect(dRes.status).toBe(201);
    const deal = (await dRes.json()) as { id: string };

    const pRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId: deal.id, title: "Prop status", bodyJson: DOC }),
    });
    expect(pRes.status).toBe(201);
    const proposal = (await pRes.json()) as { id: string };

    await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Tâche", quantity: 1, unitPrice: 100, position: 0 }),
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
      body: JSON.stringify({ signerName: "Carol", signerEmail: "carol@client.test", consent: true }),
    });

    const project = await app.basePrisma.project.findFirst({ where: { proposalId: proposal.id } });
    expect(project).not.toBeNull();
    const task = await app.basePrisma.task.findFirst({ where: { projectId: project!.id } });
    expect(task).not.toBeNull();
    return { projectId: project!.id, taskId: task!.id };
  }

  beforeAll(async () => {
    app = await bootTestApp();

    cookieA = await signup("status-A");
    await setupOrg(cookieA, "OrgStatusA");

    cookieB = await signup("status-B");
    await setupOrg(cookieB, "OrgStatusB");
  });

  afterAll(async () => { await app?.stop(); });

  it("PATCH /api/projects/:id ACTIVE->COMPLETED -> 200, statut persisté", async () => {
    const { projectId } = await seedSignedProject(cookieA);
    const res = await fetch(`${app.baseUrl}/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("COMPLETED");

    // Persistance vérifiée via DB directe.
    const proj = await app.basePrisma.project.findUnique({ where: { id: projectId } });
    expect(proj!.status).toBe("COMPLETED");
  });

  it("PATCH /api/projects/:id COMPLETED->ACTIVE -> 409 (transition interdite, sans retour)", async () => {
    const { projectId } = await seedSignedProject(cookieA);
    // Passer ACTIVE -> COMPLETED (valide).
    const completeRes = await fetch(`${app.baseUrl}/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    expect(completeRes.status).toBe(200);

    // Tenter COMPLETED -> ACTIVE (interdit).
    const backRes = await fetch(`${app.baseUrl}/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ status: "ACTIVE" }),
    });
    expect(backRes.status).toBe(409);
  });

  it("PATCH /api/projects/:id ACTIVE-><statut invalide> -> 400", async () => {
    const { projectId } = await seedSignedProject(cookieA);
    const res = await fetch(`${app.baseUrl}/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ status: "ARCHIVED" }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/tasks/:id done=true sur projet ACTIVE -> 200", async () => {
    const { taskId } = await seedSignedProject(cookieA);
    const res = await fetch(`${app.baseUrl}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ done: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { done: boolean };
    expect(body.done).toBe(true);
  });

  it("PATCH /api/tasks/:id d'un projet d'une AUTRE org -> 404 (IDOR via parent)", async () => {
    // Org A crée un projet avec une tâche.
    const { taskId } = await seedSignedProject(cookieA);
    // Org B essaie de patcher la tâche d'Org A.
    const res = await fetch(`${app.baseUrl}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieB },
      body: JSON.stringify({ done: true }),
    });
    expect(res.status).toBe(404);
  });

  it("PATCH /api/tasks/:id sur projet CANCELLED/COMPLETED -> 409", async () => {
    const { projectId, taskId } = await seedSignedProject(cookieA);
    // Fermer le projet.
    await fetch(`${app.baseUrl}/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ status: "COMPLETED" }),
    });
    // Tenter de cocher une tâche sur un projet COMPLETED -> 409.
    const res = await fetch(`${app.baseUrl}/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieA },
      body: JSON.stringify({ done: true }),
    });
    expect(res.status).toBe(409);
  });
});
