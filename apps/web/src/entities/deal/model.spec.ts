import { describe, expect, it } from "vitest";
import { dealFormSchema } from "./model";

// Le schéma zod du formulaire Deal est le miroir web du DTO serveur (DealInput).
// Il doit accepter une entrée valide (avec et sans amount) et rejeter titre vide / contactId non-UUID /
// statut hors enum / amount négatif — les mêmes règles que le ValidationPipe serveur (@IsNotEmpty,
// @IsUUID, @IsEnum(DealStatus), @Min(0)). Défense en profondeur + UX inline. Ces tests verrouillent ce miroir.

// UUID v4 réel (variant RFC : 4 en version, 8/9/a/b en variant) — c'est ce que Prisma @default(uuid())
// génère pour Contact.id, donc ce que le Select contact fournira.
const VALID_UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("dealFormSchema", () => {
  it("accepte un deal valide (titre, contact, statut, amount)", () => {
    const result = dealFormSchema.safeParse({
      title: "Refonte du site",
      contactId: VALID_UUID,
      status: "LEAD",
      amount: 1500,
    });
    expect(result.success).toBe(true);
  });

  it("accepte un deal sans amount (champ optionnel)", () => {
    const result = dealFormSchema.safeParse({
      title: "Refonte du site",
      contactId: VALID_UUID,
      status: "WON",
    });
    expect(result.success).toBe(true);
  });

  it("rejette un titre vide", () => {
    const result = dealFormSchema.safeParse({
      title: "",
      contactId: VALID_UUID,
      status: "LEAD",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un contactId non-UUID", () => {
    const result = dealFormSchema.safeParse({
      title: "Refonte",
      contactId: "pas-un-uuid",
      status: "LEAD",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un statut hors enum", () => {
    const result = dealFormSchema.safeParse({
      title: "Refonte",
      contactId: VALID_UUID,
      status: "ARCHIVED",
    });
    expect(result.success).toBe(false);
  });

  it("rejette un amount négatif", () => {
    const result = dealFormSchema.safeParse({
      title: "Refonte",
      contactId: VALID_UUID,
      status: "LEAD",
      amount: -5,
    });
    expect(result.success).toBe(false);
  });
});
