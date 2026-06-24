import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";

// Test e2e BOOTSTRAP ORG — prouve que le chemin réel du web (login-page) :
//   POST /api/auth/sign-up/email  →  navigate("/")
// — SANS appel à organization/create ni set-active — suffit à atteindre une route forOrg en 200.
//
// Mécanisme testé :
//   1. user.create.after crée org + membership owner de façon ATOMIQUE (BEGIN/COMMIT/ROLLBACK).
//   2. session.create.before injecte activeOrganizationId dans le cookie de session posé par signup.
//   3. Ces 2 hooks seuls (pas de bootstrap manuel) permettent d'atteindre GET /api/contacts (200).
//
// Note : le test IDOR cross-org pour /api/contacts est déjà couvert dans contacts.spec.ts — inutile
// de le dupliquer ici. Ce spec ne couvre QUE le chemin signup-seul → route forOrg.

const SIGNUP = "/api/auth/sign-up/email";

function setCookieToHeader(res: Response): string {
  // Concatène les Set-Cookie en un header Cookie réutilisable pour la requête suivante.
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

describe("bootstrap-org e2e — signup seul → forOrg 200 (real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("signup seul (sans organization/create ni set-active) → GET /api/contacts 200 + tableau", async () => {
    // 1. Signup email/password — même chemin que login-page (apps/web).
    //    Le hook user.create.after crée org + membership owner de façon atomique.
    //    Le hook session.create.before injecte activeOrganizationId dans la session.
    const email = `bootstrap+${Date.now()}@kessel.test`;
    const signup = await fetch(`${app.baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Sup3r-Secret-Pw!", name: "Bootstrap Test" }),
    });
    expect([200, 201]).toContain(signup.status);

    // 2. Le cookie posé par le signup contient déjà activeOrganizationId (via session.create.before).
    //    Aucun appel à organization/create ou set-active requis.
    const cookie = setCookieToHeader(signup);
    expect(cookie).toMatch(/session/i);

    // 3. Avec ce cookie seul, une route org-scoped doit répondre 200 (tableau vide au départ).
    //    Prouve que le bootstrap auto via hooks suffit au flux web réel.
    const contacts = await fetch(`${app.baseUrl}/api/contacts`, {
      headers: { cookie },
    });
    expect(contacts.status).toBe(200);
    const body = (await contacts.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});
