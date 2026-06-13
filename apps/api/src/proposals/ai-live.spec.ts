import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// SMOKE LIVE OPTIONNEL (jamais en CI/gate) — appelle VRAIMENT Claude une fois.
//
// Gaté derrière KESSEL_AI_LIVE_TEST=1 + ANTHROPIC_API_KEY réelle : skippé par défaut (describe.skipIf).
// But : vérifier qu'une sortie structurée valide revient du vrai modèle et qu'une Proposal DRAFT est
// créée bout-en-bout. Coûteux + non déterministe -> hors suite de gate.

const LIVE = process.env.KESSEL_AI_LIVE_TEST === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

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

describe.skipIf(!LIVE)("smoke live IA (KESSEL_AI_LIVE_TEST) — appelle vraiment Claude", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookie: string;
  let dealId: string;

  beforeAll(async () => {
    app = await bootTestApp();
    const signRes = await fetch(`${app.baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `live+${Date.now()}@kessel.test`,
        password: "Sup3r-Secret-Pw!",
        name: "live",
      }),
    });
    cookie = cookieFrom(signRes);
    const orgRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "OrgLive", slug: `live-${Date.now()}` }),
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
      body: JSON.stringify({ name: "Client", email: `c+${Date.now()}@x.test` }),
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

  it("génère une Proposal DRAFT avec un corps + des lignes via le vrai modèle", async () => {
    const res = await fetch(`${app.baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        dealId,
        brief: "Refonte d'un site vitrine 5 pages pour un restaurant, design moderne, responsive, SEO de base.",
      }),
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as { status: string; bodyJson: { type: string }; lines: unknown[] };
    expect(p.status).toBe("DRAFT");
    expect(p.bodyJson.type).toBe("doc");
    expect(Array.isArray(p.lines)).toBe(true);
  }, 60_000);
});
