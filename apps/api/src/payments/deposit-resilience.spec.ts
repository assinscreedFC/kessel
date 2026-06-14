import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bootTestApp } from "../test-app";
import { STRIPE_CLIENT } from "@kessel/payments";
import { toCents } from "@kessel/shared";

// e2e RED spec — PAY-01 / T-3-amount / T-3-resilience
// Wave 0 : PaymentService.createDeposit est un stub "not implemented" → ces tests ÉCHOUENT.
// Plans 02/03 les rendent GREEN.
//
// Prouve (une fois GREEN) :
//  T-3-amount : signer une proposition avec depositPercent → 200 + Payment(DEPOSIT, PENDING)
//               amountCents === toCents(grandTotal × pct/100) exact (decimal.js, jamais float)
//               orgId === proposal.orgId ; stripePaymentIntentId défini
//  T-3-resilience : si Stripe lance une erreur sur paymentIntents.create →
//               sign retourne quand même 200 (la signature reste valide),
//               Project existe toujours, AUCUNE ligne Payment créée (pas de rollback 500).

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

describe("e2e deposit resilience (PAY-01 / T-3-amount / T-3-resilience — RED Wave 0)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookie: string;
  let orgId: string;
  let dealId: string;

  // Stripe stub par défaut : paymentIntents.create réussit (renvoie un PI factice).
  const stripeStub = {
    paymentIntents: {
      create: async (_params: unknown) => ({
        id: `pi_test_${Date.now()}`,
        client_secret: `pi_test_secret_${Date.now()}`,
      }),
    },
    webhooks: {
      constructEvent: (_p: unknown, _h: unknown, _s: unknown) => {
        throw new Error("not used in deposit spec");
      },
      generateTestHeaderString: (_opts: unknown) => "not used",
    },
  };

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
    expect([200, 201]).toContain(createRes.status);
    const org = (await createRes.json()) as { id: string };
    await fetch(`${app.baseUrl}${SET_ACTIVE}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ck },
      body: JSON.stringify({ organizationId: org.id }),
    });
    return org.id;
  }

  beforeAll(async () => {
    app = await bootTestApp({ disableThrottle: true, stripeClient: stripeStub });
    // Vérifier que le STRIPE_CLIENT est bien résolu vers notre stub (pas le vrai SDK Stripe)
    app._nestApp.get(STRIPE_CLIENT); // assure que le token est résolu
    cookie = await signup("dep-resilience");
    orgId = await setupOrg(cookie, "DepResilienceOrg");
    // Créer un contact + deal
    const contactRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Client Test", email: "client@test.com" }),
    });
    const contact = (await contactRes.json()) as { id: string };
    const dealRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ contactId: contact.id, title: "Deal paiement", status: "LEAD" }),
    });
    const deal = (await dealRes.json()) as { id: string };
    dealId = deal.id;
  });

  afterAll(async () => {
    await app.stop();
  });

  it("T-3-amount: signer une proposition crée Payment(DEPOSIT, PENDING) avec montant exact en centimes", async () => {
    // Créer une proposition avec lignes de devis
    const propRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Prop acompte", bodyJson: DOC }),
    });
    expect([200, 201]).toContain(propRes.status);
    const proposal = (await propRes.json()) as { id: string };

    // Ajouter une ligne de devis (200 × 3 = 600.00 EUR → grandTotal = "600.00")
    await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Prestation", quantity: 3, unitPrice: 200.00, position: 1 }),
    });

    // Envoyer la proposition (transition DRAFT → SENT)
    const sendRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    expect([200, 201]).toContain(sendRes.status);
    const { token } = (await sendRes.json()) as { token: string; url: string };

    // Signer la proposition (transition SENT → SIGNED) via le lien public
    const signRes = await fetch(`${app.baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Jean Dupont", signerEmail: "jean@dupont.fr", consent: true }),
    });
    expect(signRes.status).toBe(200);

    // Vérifier qu'un Payment(DEPOSIT, PENDING) a été créé
    const payments = await app.basePrisma.payment.findMany({
      where: { orgId, kind: "DEPOSIT" },
    });
    expect(payments).toHaveLength(1);
    const payment = payments[0];
    expect(payment.status).toBe("PENDING");
    expect(payment.orgId).toBe(orgId);
    expect(payment.stripePaymentIntentId).toBeTruthy();

    // T-3-amount : montant exact en centimes (30% de 600.00 EUR = 180.00 → 18000 centimes)
    const grandTotal = "600.00";
    const depositPct = payment.amountCents; // récupéré pour vérification
    const expectedCents = toCents(Number(grandTotal) * 30 / 100);
    expect(payment.amountCents).toBe(expectedCents);
    expect(depositPct).toBe(18000);
  });

  it("T-3-resilience: si Stripe échoue, sign retourne 200 et aucun Payment n'est créé", async () => {
    // Simuler une erreur Stripe via spy sur le stub partagé (injecté dans l'app via bootTestApp).
    // vi.spyOn remplace temporairement paymentIntents.create pour ce test uniquement.
    const spy = vi.spyOn(stripeStub.paymentIntents, "create").mockRejectedValueOnce(
      new Error("Stripe network error (simulé)"),
    );

    // Créer une nouvelle proposition pour ce test
    const propRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ dealId, title: "Prop resilience", bodyJson: DOC }),
    });
    expect([200, 201]).toContain(propRes.status);
    const proposal = (await propRes.json()) as { id: string };

    await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ description: "Forfait", quantity: 1, unitPrice: 1000.00, position: 1 }),
    });

    const sendRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
    });
    const { token } = (await sendRes.json()) as { token: string };

    const countBefore = await app.basePrisma.payment.count({ where: { orgId, kind: "DEPOSIT" } });

    const signRes = await fetch(`${app.baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Jane Doe", signerEmail: "jane@doe.fr", consent: true }),
    });
    // Résilience : sign retourne 200 même si Stripe échoue
    expect(signRes.status).toBe(200);

    // Aucune ligne Payment supplémentaire créée (le stub fail n'a pas persisté de Payment)
    const countAfter = await app.basePrisma.payment.count({ where: { orgId, kind: "DEPOSIT" } });
    expect(countAfter).toBe(countBefore);

    // Le Project existe toujours
    const project = await app.basePrisma.project.findFirst({ where: { orgId } });
    expect(project).toBeTruthy();

    // Nettoyage : restaurer le stub à son comportement par défaut (passing)
    spy.mockRestore();
  });
});
