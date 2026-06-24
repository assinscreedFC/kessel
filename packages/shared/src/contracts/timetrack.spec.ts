import { describe, it, expect } from "vitest";
import { isValidSirenSiret } from "./timetrack";

describe("isValidSirenSiret (FX-04)", () => {
  it("accepte un SIREN 9 chiffres Luhn valide", () => {
    expect(isValidSirenSiret("552100554")).toBe(true);
  });

  it("accepte un SIRET 14 chiffres Luhn valide", () => {
    expect(isValidSirenSiret("73282932000074")).toBe(true);
  });

  it("accepte le siège La Poste (Luhn ET règle %5)", () => {
    expect(isValidSirenSiret("35600000000048")).toBe(true);
  });

  it("accepte un établissement La Poste via la règle %5 (échoue Luhn pur)", () => {
    expect(isValidSirenSiret("35600009000061")).toBe(true);
  });

  it("rejette un SIREN au checksum Luhn invalide", () => {
    expect(isValidSirenSiret("552100555")).toBe(false);
  });

  it("rejette 123456789 (Luhn ko)", () => {
    expect(isValidSirenSiret("123456789")).toBe(false);
  });

  it("rejette une mauvaise longueur", () => {
    expect(isValidSirenSiret("1234567")).toBe(false);
  });

  it("rejette une valeur avec séparateurs non nettoyés", () => {
    expect(isValidSirenSiret("552 100 554")).toBe(false);
  });

  it("rejette une chaîne vide", () => {
    expect(isValidSirenSiret("")).toBe(false);
  });
});
