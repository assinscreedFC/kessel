import { describe, expect, it } from "vitest";
import { contactFormSchema } from "./model";

// Le schéma zod du formulaire Contact est le miroir web du DTO serveur (ContactInput).
// Il doit accepter une entrée valide et rejeter email malformé / nom vide — la même règle que
// le ValidationPipe serveur (défense en profondeur, UX inline). Ces tests verrouillent ce miroir.

describe("contactFormSchema", () => {
  it("accepte un contact valide (nom, email, organisation)", () => {
    const result = contactFormSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
      organizationName: "Analytical Engines",
    });
    expect(result.success).toBe(true);
  });

  it("accepte un contact sans organisation (champ optionnel)", () => {
    const result = contactFormSchema.safeParse({
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejette un email malformé", () => {
    const result = contactFormSchema.safeParse({
      name: "Ada Lovelace",
      email: "pas-un-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un nom vide", () => {
    const result = contactFormSchema.safeParse({
      name: "",
      email: "ada@example.com",
    });
    expect(result.success).toBe(false);
  });
});
