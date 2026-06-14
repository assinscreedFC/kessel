import { describe, expect, it } from "vitest";
import { PAYMENT_STATUS_META } from "./model";

// Spec unitaire du modèle de paiement web (PAY-05 — dashboard agence).
// Prouve que PAYMENT_STATUS_META contient les 3 statuts avec labels FR et classes badge exactes
// (03-UI-SPEC §Color). Ce spec est GREEN dès Wave 0 (model.ts est réel, pas un stub).

describe("PAYMENT_STATUS_META", () => {
  it("contient exactement les 3 clés PENDING, PAID, FAILED", () => {
    const keys = Object.keys(PAYMENT_STATUS_META);
    expect(keys).toHaveLength(3);
    expect(keys).toContain("PENDING");
    expect(keys).toContain("PAID");
    expect(keys).toContain("FAILED");
  });

  it("PENDING: label 'En attente' + badge yellow", () => {
    expect(PAYMENT_STATUS_META.PENDING.label).toBe("En attente");
    expect(PAYMENT_STATUS_META.PENDING.badge).toBe("bg-yellow-100 text-yellow-700");
  });

  it("PAID: label 'Payé' + badge green", () => {
    expect(PAYMENT_STATUS_META.PAID.label).toBe("Payé");
    expect(PAYMENT_STATUS_META.PAID.badge).toBe("bg-green-100 text-green-700");
  });

  it("FAILED: label 'Échoué' + badge red", () => {
    expect(PAYMENT_STATUS_META.FAILED.label).toBe("Échoué");
    expect(PAYMENT_STATUS_META.FAILED.badge).toBe("bg-red-100 text-red-700");
  });
});
