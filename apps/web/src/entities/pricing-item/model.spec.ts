import { describe, expect, it } from "vitest";
import { pricingItemFormSchema } from "./model";

// Le schéma zod du formulaire PricingItem est le miroir web du DTO serveur (PricingItemInput).
// Il doit accepter une entrée valide (avec et sans unit), accepter un prix à 0, et rejeter une
// prestation vide / un prix négatif / un prix non numérique — les mêmes règles que le ValidationPipe
// serveur (@IsNotEmpty name, @Min(0) unitPrice). Défense en profondeur + UX inline (T-3-web-input).

describe("pricingItemFormSchema", () => {
  it("accepte un tarif valide (prestation, prix, unité)", () => {
    const result = pricingItemFormSchema.safeParse({
      name: "Dev",
      unitPrice: 500,
      unit: "jour",
    });
    expect(result.success).toBe(true);
  });

  it("accepte un prix à 0 et sans unité (unit optionnel)", () => {
    const result = pricingItemFormSchema.safeParse({
      name: "X",
      unitPrice: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejette une prestation vide", () => {
    const result = pricingItemFormSchema.safeParse({
      name: "",
      unitPrice: 500,
    });
    expect(result.success).toBe(false);
  });

  it("rejette un prix négatif", () => {
    const result = pricingItemFormSchema.safeParse({
      name: "Dev",
      unitPrice: -10,
    });
    expect(result.success).toBe(false);
  });

  it("rejette un prix non numérique", () => {
    const result = pricingItemFormSchema.safeParse({
      name: "Dev",
      unitPrice: "abc",
    });
    expect(result.success).toBe(false);
  });
});
