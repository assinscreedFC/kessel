import { describe, expect, it } from "vitest";
import { isValidBrandColor, DEFAULT_BRAND_COLOR } from "./branding";

// Validation couleur de marque — source de vérité unique front/back (anti CSS injection, T-8-css).
describe("isValidBrandColor — format hex #RRGGBB strict", () => {
  it("accepte #RRGGBB minuscule et majuscule", () => {
    expect(isValidBrandColor("#4f46e5")).toBe(true);
    expect(isValidBrandColor("#4F46E5")).toBe(true);
  });

  it("rejette format court #RGB", () => {
    expect(isValidBrandColor("#fff")).toBe(false);
  });

  it("rejette absence de #", () => {
    expect(isValidBrandColor("4F46E5")).toBe(false);
  });

  it("rejette caractères non-hex", () => {
    expect(isValidBrandColor("#zzzzzz")).toBe(false);
  });

  it("rejette payload CSS injection", () => {
    expect(isValidBrandColor("red;background:url(x)")).toBe(false);
    expect(isValidBrandColor("")).toBe(false);
  });

  it("DEFAULT_BRAND_COLOR est lui-même valide", () => {
    expect(isValidBrandColor(DEFAULT_BRAND_COLOR)).toBe(true);
  });
});
