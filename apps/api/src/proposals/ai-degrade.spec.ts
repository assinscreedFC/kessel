import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// e2e DÉGRADATION GRACIEUSE (T-4-degrade) — Postgres RÉEL, provider Anthropic RÉEL (PAS le fake),
// env SANS ANTHROPIC_API_KEY.
//
// Prouve que l'API self-host BOOTE et SERT sans clé IA :
//  - POST /api/proposals/generate -> 503 (AiUnavailableError mappée, PAS 500/crash) ;
//  - GET /api/proposals -> 200 (le reste de l'API fonctionne normalement).
//
// On utilise bootTestApp (sans override) : le provider AnthropicProposalGenerator réel est en place ;
// la clé absente est détectée à l'appel (jamais au boot — pas de new Anthropic() prématuré).

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

describe("e2e dégradation IA sans clé (T-4-degrade — real PG, provider Anthropic réel)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookie: string;
  let dealId: string;
  let savedKey: string | undefined;

  beforeAll(async () => {
    // Garantit l'ABSENCE de clé pour ce describe (le boot ne doit pas crasher, l'appel doit 503).
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    app = await bootTestApp();

    const signRes = await fetch(`${app.baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: `degrade+${Date.now()}-${Math.random().toString(36).slice(2)}@kessel.test`,
        password: "Sup3r-Secret-Pw!",
        name: "degrade",
      }),
    });
    cookie = cookieFrom(signRes);

    const orgRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "OrgDegrade", slug: `degrade-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
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
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it("POST /api/proposals/generate sans clé -> 503 (pas 500/crash)", async () => {
    const res = await fetch(`${app.baseUrl}/api/proposals/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, brief: "Brief sans clé IA configurée." }),
    });
    expect(res.status).toBe(503);
  });

  it("GET /api/proposals répond TOUJOURS 200 (le reste de l'API fonctionne sans clé)", async () => {
    const res = await fetch(`${app.baseUrl}/api/proposals`, { headers: { cookie } });
    expect(res.status).toBe(200);
  });
});
