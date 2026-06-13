import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startPostgres } from "../../../tests/setup/testcontainers";
import { bootTestApp } from "./test-app";

// Test e2e AUTH (FOUND-02) sur Postgres RÉEL (Testcontainers, AUCUN mock — règle projet).
// Prouve : signup email/password -> login -> la session PERSISTE (cookie DB, pas JWT vendor)
// sur une requête authentifiée suivante ; et qu'un mauvais mot de passe -> 401 (pas de session).
//
// Le boot applique l'ordre canonique de migration (Better Auth migrate AVANT prisma push).
// startPostgres est ré-exporté implicitement via bootTestApp ; on l'importe ici pour la garde
// d'environnement (skip si Docker indisponible serait géré en amont — ici real I/O obligatoire).
void startPostgres;

const SIGNUP = "/api/auth/sign-up/email";
const SIGNIN = "/api/auth/sign-in/email";

function setCookieToHeader(res: Response): string {
  // Concatène les Set-Cookie en un header Cookie réutilisable pour la requête suivante.
  const raw = res.headers.get("set-cookie") ?? "";
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

describe("auth e2e (FOUND-02, real Postgres)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  afterAll(async () => {
    await app?.stop();
  });

  it("signup -> login -> session persiste sur une requête authentifiée", async () => {
    const email = `owner+${Date.now()}@kessel.test`;
    const password = "Sup3r-Secret-Pw!";

    // 1. Signup email/password.
    const signup = await fetch(`${app.baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "Owner Test" }),
    });
    expect([200, 201]).toContain(signup.status);

    // 2. Login avec les mêmes creds -> doit poser un cookie de session.
    const login = await fetch(`${app.baseUrl}${SIGNIN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = setCookieToHeader(login);
    expect(cookie).toMatch(/session/i);

    // 3. Requête authentifiée suivante avec ce cookie : la session PERSISTE (stockée en DB).
    //    get-session renvoie la session si et seulement si le cookie est valide côté serveur.
    const me = await fetch(`${app.baseUrl}/api/auth/get-session`, {
      headers: { cookie },
    });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { user?: { email?: string } } | null;
    expect(body?.user?.email).toBe(email);
  });

  it("login avec mauvais mot de passe -> 401, pas de session", async () => {
    const email = `baduser+${Date.now()}@kessel.test`;
    const password = "Correct-Horse-Battery!";

    const signup = await fetch(`${app.baseUrl}${SIGNUP}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name: "Bad Pw" }),
    });
    expect([200, 201]).toContain(signup.status);

    const login = await fetch(`${app.baseUrl}${SIGNIN}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "WRONG-password-000" }),
    });
    expect(login.status).toBe(401);
    const cookie = setCookieToHeader(login);
    expect(cookie).not.toMatch(/session_token/i);
  });
});
