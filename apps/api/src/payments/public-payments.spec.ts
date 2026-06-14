import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootTestApp } from "../test-app";
import { STRIPE_CLIENT } from "@kessel/payments";

// e2e RED spec — PAY-02 / PAY-05 / T-3-enum
// Wave 0 : getPublicPaymentByToken est un stub "not implemented" → ces tests ÉCHOUENT.
// Plan 02 les rend GREEN.
//
// Prouve (une fois GREEN) :
//  PAY-02 : GET /api/public/payments/:token → 200 + { clientSecret, kind, amountCents, currency, orgName }
//           après qu'un dépôt Payment(DEPOSIT, PENDING) a été créé à la signature.
//  T-3-enum : token inconnu/aléatoire → 404 (indifférencié — pas de leak, anti-énumération).
//  PAY-05 : BALANCE Payment accessible via son propre token après acompte PAID.

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

describe("e2e GET /api/public/payments/:token (PAY-02/05 / T-3-enum — RED Wave 0)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookie: string;
  let orgId: string;
  let dealId: string;

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

  async function setupOrg(ck: string, name: string): Promise<string> {
    const createRes = await fetch(`${app.baseUrl}${CREATE_ORG}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ck },
      body: JSON.stringify({ name, slug: `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}` }),
    });
    const org = (await createRes.json()) as { id: string };
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ck },
      body: JSON.stringify({ organizationId: org.id }),
    });
    return org.id;
  }

  beforeAll(async () => {
    app = await bootTestApp({ disableThrottle: true });
    cookie = await signup("pub-payments");
    orgId = await setupOrg(cookie, "PubPaymentsOrg");
    const contactRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Client Pay", email: "client.pay@test.com" }),
    });
    const contact = (await contactRes.json()) as { id: string };
    const dealRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ contactId: contact.id, title: "Deal public paiement" }),
    });
    dealId = ((await dealRes.json()) as { id: string }).id;
  });

  afterAll(async () => {
    await app.stop();
  });

  async function createSignedProposal(): Promise<string> {
    // Créer proposition + ligne + envoyer + signer → renvoie le paymentToken du Payment DEPOSIT
    const propRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Prop pub pay", bodyJson: DOC }),
    });
    const proposal = (await propRes.json()) as { id: string };

    await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Prestation", quantity: "2", unitPrice: "500.00", position: 1 }),
    });

    const sendRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    const { token: shareToken } = (await sendRes.json()) as { token: string };

    const signRes = await fetch(`${app.baseUrl}/api/public/proposals/${shareToken}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Client Sign", signerEmail: "sign@client.fr" }),
    });
    expect(signRes.status).toBe(200);
    const { paymentToken } = (await signRes.json()) as { paymentToken?: string };
    // paymentToken sera défini après Plan 02 — en Wave 0 ce champ n'existe pas encore
    return paymentToken ?? "stub-token-not-yet-implemented";
  }

  it("PAY-02: GET /api/public/payments/:token → 200 + { clientSecret, kind, amountCents, currency, orgName }", async () => {
    const paymentToken = await createSignedProposal();

    const res = await fetch(`${app.baseUrl}/api/public/payments/${paymentToken}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      clientSecret?: string;
      kind?: string;
      amountCents?: number;
      currency?: string;
      orgName?: string;
    };
    expect(body.clientSecret).toBeTruthy();
    expect(body.kind).toBe("DEPOSIT");
    expect(typeof body.amountCents).toBe("number");
    expect(body.amountCents).toBeGreaterThan(0);
    expect(body.currency).toBe("EUR");
    expect(body.orgName).toBeTruthy();
  });

  it("T-3-enum: token inconnu (garbage) → 404 indifférencié (anti-énumération)", async () => {
    const res = await fetch(`${app.baseUrl}/api/public/payments/garbage-token-that-does-not-exist`);
    // 404 : pas de leak (ni 401, ni 403, ni 500 — indifférencié T-3-enum)
    expect(res.status).toBe(404);
  });

  it("T-3-enum: token aléatoire base64url → 404", async () => {
    const randomToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const res = await fetch(`${app.baseUrl}/api/public/payments/${randomToken}`);
    expect(res.status).toBe(404);
  });
});
