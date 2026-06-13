import { describe, expect, it } from "vitest";
import { OUTCOME_KIND_META } from "./status";

// OUTCOME_KIND_META est la source unique du mapping issue -> (label FR + badge) de la vue dataset.
// Il doit couvrir EXACTEMENT les 2 issues du contrat (WON/LOST) et réutiliser les hues gagné/perdu
// (green/red) cohérentes avec DEAL_STATUS_META. Ces tests verrouillent ce mapping (anti-drift visuel).

describe("OUTCOME_KIND_META", () => {
  it("couvre exactement WON et LOST", () => {
    expect(Object.keys(OUTCOME_KIND_META).sort()).toEqual(["LOST", "WON"]);
  });

  it("mappe WON sur Gagné / hue verte (cohérent avec DEAL_STATUS_META.WON)", () => {
    expect(OUTCOME_KIND_META.WON.label).toBe("Gagné");
    expect(OUTCOME_KIND_META.WON.badge).toContain("green");
  });

  it("mappe LOST sur Perdu / hue rouge (cohérent avec DEAL_STATUS_META.LOST)", () => {
    expect(OUTCOME_KIND_META.LOST.label).toBe("Perdu");
    expect(OUTCOME_KIND_META.LOST.badge).toContain("red");
  });
});
