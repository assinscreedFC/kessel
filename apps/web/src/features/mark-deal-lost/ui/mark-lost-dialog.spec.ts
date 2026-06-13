import { describe, expect, it } from "vitest";
import { markLostFormSchema } from "@/entities/deal/model";

// Le schéma zod de "Marquer comme perdu" est le miroir web de UpdateDealDto.reason (Plan 06-02) :
// raison OPTIONNELLE, bornée à 2000 caractères (@MaxLength 2000). Défense en profondeur + UX inline ;
// la frontière d'autorité reste le ValidationPipe serveur. Ces tests verrouillent le miroir.

describe("markLostFormSchema", () => {
  it("accepte une raison vide (champ optionnel — discrétion respectée)", () => {
    expect(markLostFormSchema.safeParse({ reason: "" }).success).toBe(true);
  });

  it("accepte l'absence de raison", () => {
    expect(markLostFormSchema.safeParse({}).success).toBe(true);
  });

  it("accepte une raison courte", () => {
    expect(markLostFormSchema.safeParse({ reason: "Budget trop serré" }).success).toBe(true);
  });

  it("rejette une raison de plus de 2000 caractères (miroir @MaxLength 2000)", () => {
    const result = markLostFormSchema.safeParse({ reason: "x".repeat(2001) });
    expect(result.success).toBe(false);
  });
});
