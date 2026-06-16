import { describe, expect, it, vi } from "vitest";
import { PaymentService } from "./payment.service";
import type { StripeLike } from "./stripe.tokens";

// RED specs — SEPA SetupIntent (PAY-06, Phase 8).
// Ces specs DOIVENT ÉCHOUER : createSepaSetup n'existe pas encore sur PaymentService (Wave 1, Plan 02).
// NE PAS les skip. NE PAS les marquer .todo.
//
// Le stub StripeLike est étendu localement avec setupIntents.create :
// l'interface StripeLike réelle sera étendue en Wave 1 (Plan 02) — ici on cast as never pour
// permettre le typage RED sans modifier l'interface (qui est Wave 1).
//
// Comportements attendus une fois GREEN :
//  - createSepaSetup({ paymentId, orgId, ... }) appelle stripe.setupIntents.create avec
//    payment_method_types: ['sepa_debit'], usage: 'off_session'
//  - retourne { setupClientSecret: string }

// Stub StripeLike étendu pour le test SEPA RED (setupIntents pas encore dans l'interface réelle)
type StripeLikeWithSepa = StripeLike & {
  setupIntents: {
    create(params: {
      payment_method_types: string[];
      usage: string;
      metadata?: Record<string, string>;
    }): Promise<{ id: string; client_secret: string | null }>;
  };
};

function makeStripeStub(): StripeLikeWithSepa {
  return {
    paymentIntents: {
      create: vi.fn().mockResolvedValue({ id: "pi_test", client_secret: "pi_test_secret" }),
      retrieve: vi.fn().mockResolvedValue({ id: "pi_test", client_secret: "pi_test_secret" }),
    },
    webhooks: {
      constructEvent: vi.fn(),
      generateTestHeaderString: vi.fn(),
    },
    setupIntents: {
      create: vi.fn().mockResolvedValue({ id: "seti_test", client_secret: "seti_test_secret" }),
    },
  };
}

describe("PaymentService — createSepaSetup (PAY-06 — RED)", () => {
  it("createSepaSetup appelle stripe.setupIntents.create avec payment_method_types:['sepa_debit'] et usage:'off_session'", async () => {
    // Arrange
    const stripeStub = makeStripeStub();
    const service = new PaymentService(stripeStub as unknown as StripeLike);

    // RED : méthode absente → TypeError. GREEN : appel Stripe + retour { setupClientSecret }.
    const result = await (service as unknown as {
      createSepaSetup(args: { paymentId: string; orgId: string }): Promise<{ setupClientSecret: string }>;
    }).createSepaSetup({ paymentId: "pay_123", orgId: "org_abc" });

    // Vérifier l'appel Stripe
    expect(stripeStub.setupIntents.create).toHaveBeenCalledOnce();
    expect(stripeStub.setupIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ["sepa_debit"],
        usage: "off_session",
      }),
    );

    // Vérifier le retour
    expect(result).toHaveProperty("setupClientSecret");
    expect(typeof result.setupClientSecret).toBe("string");
    expect(result.setupClientSecret).toBe("seti_test_secret");
  });

  it("createSepaSetup retourne { setupClientSecret } non null (jamais null — anti-T-3-card)", async () => {
    // Arrange
    const stripeStub = makeStripeStub();
    const service = new PaymentService(stripeStub as unknown as StripeLike);

    // RED : méthode absente → TypeError.
    const result = await (service as unknown as {
      createSepaSetup(args: { paymentId: string; orgId: string }): Promise<{ setupClientSecret: string }>;
    }).createSepaSetup({ paymentId: "pay_456", orgId: "org_def" });

    expect(result.setupClientSecret).toBeTruthy();
  });
});
