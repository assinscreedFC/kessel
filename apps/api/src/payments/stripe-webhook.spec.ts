import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { bootTestApp } from "../test-app";
import { STRIPE_CLIENT } from "@kessel/payments";

// e2e RED spec — PAY-03/04/05 / T-3-sig / T-3-replay / T-3-iso
// Wave 0 : handleWebhookEvent est un stub "not implemented" → ces tests ÉCHOUENT.
// Plan 03 les rend GREEN.
//
// Prouve (une fois GREEN) :
//  T-3-sig : signature HMAC invalide → 400 + ZÉRO écriture DB (Payment inchangé, pas de ProcessedStripeEvent)
//  PAY-03 : payment_intent.succeeded signé via generateTestHeaderString → Payment PENDING→PAID + ProcessedStripeEvent row
//  T-3-replay : rejouer le même event.id → 200, statut inchangé, pas de doublon ProcessedStripeEvent (idempotent)
//  T-3-iso : PI d'org A avec metadata.orgId = orgB → reste attribué à org A (résolution via Payment mapping, pas metadata)
//  PAY-05 : payment_intent.succeeded sur DEPOSIT → BALANCE Payment(PENDING) créé pour (total − acompte)

// Le secret webhook utilisé en test — injecté dans l'env AVANT bootTestApp.
const WEBHOOK_SECRET = "whsec_test_secret_kessel_e2e";
process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;

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

/** Construit un payload Stripe payment_intent.succeeded signé avec generateTestHeaderString. */
function buildSignedWebhookRequest(
  stripe: Stripe,
  piId: string,
  orgId: string,
  type: string = "payment_intent.succeeded",
  eventId?: string,
) {
  const payload = JSON.stringify({
    id: eventId ?? `evt_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    data: {
      object: {
        id: piId,
        object: "payment_intent",
        status: "succeeded",
        // metadata.orgId = cross-check — PAS la source d'autorité (T-3-iso)
        metadata: { orgId },
      },
    },
  });

  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WEBHOOK_SECRET,
  });

  return { payload, header };
}

describe("e2e POST /api/webhooks/stripe (PAY-03/04/05 / T-3-sig / T-3-replay / T-3-iso — RED Wave 0)", () => {
  let app: Awaited<ReturnType<typeof bootTestApp>>;
  let cookie: string;
  let orgId: string;
  let cookieB: string;
  let orgBId: string;
  let dealId: string;
  let stripeInstance: Stripe;

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

  async function seedDepositPayment(
    ck: string,
    dId: string,
    piId: string,
    oId: string,
    projectId: string,
    amountCents: number,
  ): Promise<string> {
    // Insère directement un Payment(DEPOSIT, PENDING) lié au PI Stripe (bypass service stub)
    const payment = await app.basePrisma.payment.create({
      data: {
        orgId: oId,
        projectId,
        stripePaymentIntentId: piId,
        kind: "DEPOSIT",
        status: "PENDING",
        amountCents,
        currency: "EUR",
      },
    });
    return payment.id;
  }

  beforeAll(async () => {
    app = await bootTestApp({ disableThrottle: true });
    // Stripe SDK réel (uniquement pour generateTestHeaderString — pas de réseau)
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_not_for_prod");

    cookie = await signup("webhook-org-a");
    orgId = await setupOrg(cookie, "WebhookOrgA");
    cookieB = await signup("webhook-org-b");
    orgBId = await setupOrg(cookieB, "WebhookOrgB");

    // Contact + deal pour org A
    const contactRes = await fetch(`${app.baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ name: "Client Webhook", email: "wh@test.com" }),
    });
    const contact = (await contactRes.json()) as { id: string };
    const dealRes = await fetch(`${app.baseUrl}/api/deals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ contactId: contact.id, title: "Deal webhook", status: "LEAD" }),
    });
    dealId = ((await dealRes.json()) as { id: string }).id;
  });

  afterAll(async () => {
    await app.stop();
  });

  async function createProjectForOrg(ck: string, dId: string, oId: string): Promise<{ projectId: string }> {
    // Crée une proposition → l'envoie → la signe → récupère le Project créé
    const propRes = await fetch(`${app.baseUrl}/api/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ck },
      body: JSON.stringify({ dealId: dId, title: "Prop webhook", bodyJson: DOC }),
    });
    const proposal = (await propRes.json()) as { id: string };
    await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ck },
      body: JSON.stringify({ description: "Dev", quantity: 5, unitPrice: 200.00, position: 1 }),
    });
    const sendRes = await fetch(`${app.baseUrl}/api/proposals/${proposal.id}/send`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ck },
    });
    const { token } = (await sendRes.json()) as { token: string };
    await fetch(`${app.baseUrl}/api/public/proposals/${token}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signerName: "Signer", signerEmail: "signer@test.com", consent: true }),
    });
    const project = await app.basePrisma.project.findFirst({ where: { orgId: oId } });
    return { projectId: project!.id };
  }

  it("T-3-sig: signature HMAC invalide → 400 + zéro écriture DB", async () => {
    const piId = `pi_invalid_sig_${Date.now()}`;
    const payload = JSON.stringify({
      id: `evt_${Date.now()}`,
      type: "payment_intent.succeeded",
      data: { object: { id: piId, object: "payment_intent", status: "succeeded", metadata: {} } },
    });

    // Signature avec le MAUVAIS secret → doit être rejetée
    const wrongHeader = stripeInstance.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_wrong_secret_not_valid",
    });

    const eventCountBefore = await app.basePrisma.processedStripeEvent.count();

    const res = await fetch(`${app.baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": wrongHeader },
      body: payload,
    });
    expect(res.status).toBe(400);

    // Aucune écriture DB (ProcessedStripeEvent ni Payment inchangés)
    const eventCountAfter = await app.basePrisma.processedStripeEvent.count();
    expect(eventCountAfter).toBe(eventCountBefore);
  });

  it("PAY-03: payment_intent.succeeded valide → Payment PENDING→PAID + ProcessedStripeEvent créé", async () => {
    const { projectId } = await createProjectForOrg(cookie, dealId, orgId);
    const piId = `pi_succeed_${Date.now()}`;
    const depositAmountCents = 30000; // 300.00 EUR

    await seedDepositPayment(cookie, dealId, piId, orgId, projectId, depositAmountCents);

    const { payload, header } = buildSignedWebhookRequest(stripeInstance, piId, orgId);
    const eventId = JSON.parse(payload).id as string;

    const res = await fetch(`${app.baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    expect(res.status).toBe(200);

    // Payment mis à jour PENDING → PAID
    const payment = await app.basePrisma.payment.findFirst({
      where: { stripePaymentIntentId: piId },
    });
    expect(payment?.status).toBe("PAID");

    // ProcessedStripeEvent créé (idempotence)
    const processed = await app.basePrisma.processedStripeEvent.findUnique({
      where: { eventId },
    });
    expect(processed).toBeTruthy();
    expect(processed?.type).toBe("payment_intent.succeeded");
  });

  it("T-3-replay: rejouer le même event.id → 200 idempotent, pas de doublon ProcessedStripeEvent", async () => {
    const { projectId } = await createProjectForOrg(cookie, dealId, orgId);
    const piId = `pi_replay_${Date.now()}`;
    const fixedEventId = `evt_replay_fixed_${Date.now()}`;
    const depositAmountCents = 15000;

    await seedDepositPayment(cookie, dealId, piId, orgId, projectId, depositAmountCents);

    const { payload, header } = buildSignedWebhookRequest(
      stripeInstance, piId, orgId, "payment_intent.succeeded", fixedEventId,
    );

    // 1er envoi
    const res1 = await fetch(`${app.baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    expect(res1.status).toBe(200);

    // 2e envoi (même event.id) → idempotent, 200, pas de doublon
    const header2 = stripeInstance.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });
    const res2 = await fetch(`${app.baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header2 },
      body: payload,
    });
    expect(res2.status).toBe(200);

    // Un seul ProcessedStripeEvent pour cet eventId
    const count = await app.basePrisma.processedStripeEvent.count({
      where: { eventId: fixedEventId },
    });
    expect(count).toBe(1);
  });

  it("T-3-iso: PI d'org A avec metadata.orgId = orgB → reste attribué à org A", async () => {
    const { projectId } = await createProjectForOrg(cookie, dealId, orgId);
    const piId = `pi_iso_${Date.now()}`;
    await seedDepositPayment(cookie, dealId, piId, orgId, projectId, 20000);

    // metadata.orgId = orgB (injection malveillante) — doit être ignoré, org résolue via Payment mapping
    const { payload, header } = buildSignedWebhookRequest(
      stripeInstance, piId,
      orgBId, // metadata.orgId = orgB (le « mauvais » orgId)
    );

    const res = await fetch(`${app.baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    expect(res.status).toBe(200);

    // Le Payment appartient toujours à orgId (org A), pas orgBId
    const payment = await app.basePrisma.payment.findFirst({
      where: { stripePaymentIntentId: piId },
    });
    expect(payment?.orgId).toBe(orgId);
    expect(payment?.status).toBe("PAID");
  });

  it("PAY-05: succeeded sur DEPOSIT → BALANCE Payment(PENDING) créé pour (total − acompte)", async () => {
    const { projectId } = await createProjectForOrg(cookie, dealId, orgId);
    const piId = `pi_balance_${Date.now()}`;
    // Grand total = 1000.00 EUR → 100000 centimes. Acompte 30% = 30000 centimes. Solde = 70000.
    const depositAmountCents = 30000;
    await seedDepositPayment(cookie, dealId, piId, orgId, projectId, depositAmountCents);

    // Stocker le grand total dans le budgetSnapshot du Project (Plan 02 le persiste).
    // Contrat réel BudgetSnapshot : total est une string EUR (decimal toFixed(2)), PAS totalCents.
    // Le service convertit via toCents() — ce seed exerce le vrai contrat (anti faux-positif).
    await app.basePrisma.project.update({
      where: { id: projectId },
      data: {
        budgetSnapshot: { total: "1000.00", currency: "EUR", signedAt: new Date().toISOString(), lines: [] },
      },
    });

    const { payload, header } = buildSignedWebhookRequest(stripeInstance, piId, orgId);

    const res = await fetch(`${app.baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    expect(res.status).toBe(200);

    // Un Payment BALANCE(PENDING) doit être créé pour le solde
    const balancePayment = await app.basePrisma.payment.findFirst({
      where: { projectId, kind: "BALANCE" },
    });
    expect(balancePayment).toBeTruthy();
    expect(balancePayment?.status).toBe("PENDING");
    expect(balancePayment?.amountCents).toBe(70000); // 100000 − 30000
    expect(balancePayment?.orgId).toBe(orgId);
  });
});
