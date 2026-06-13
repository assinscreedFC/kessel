import { describe, expect, it } from "vitest";
import { buildRows, formatTimestamp, splitOverflow, type ProposalEventLike } from "./timeline";

// Tests de la logique PURE de la timeline (Suivi, DELIV-02). Le rendu (icônes, classes) n'est pas testé
// ici (composant React) — seule la construction des lignes et le formatage fr-FR sont couverts.

const sent: ProposalEventLike = { id: "e1", type: "SENT", occurredAt: "2026-06-13T09:00:00.000Z" };
const opened: ProposalEventLike = { id: "e2", type: "OPENED", occurredAt: "2026-06-13T10:00:00.000Z" };
const viewed: ProposalEventLike = { id: "e3", type: "VIEWED", occurredAt: "2026-06-13T11:00:00.000Z" };

describe("buildRows", () => {
  it("maps server events 1:1 preserving order and type", () => {
    const rows = buildRows([sent, opened, viewed], "SENT");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.type)).toEqual(["SENT", "OPENED", "VIEWED"]);
    expect(rows[0].key).toBe("e1");
  });

  it("returns empty array for no events on a SENT proposal", () => {
    expect(buildRows([], "SENT")).toEqual([]);
  });

  it("appends a derived SIGNED row when status is SIGNED", () => {
    const rows = buildRows([sent, opened], "SIGNED");
    expect(rows).toHaveLength(3);
    expect(rows[rows.length - 1].type).toBe("SIGNED");
    expect(rows[rows.length - 1].key).toBe("signed");
  });

  it("dates the SIGNED row at the last event timestamp when events exist", () => {
    const rows = buildRows([sent, opened], "SIGNED");
    expect(rows[rows.length - 1].occurredAt).toBe(opened.occurredAt);
  });

  it("surfaces signerName on the SIGNED row only when an event carries it", () => {
    const signedEvent: ProposalEventLike = { ...sent, signerName: "Marie Dupont" };
    const rows = buildRows([signedEvent], "SIGNED");
    expect(rows[rows.length - 1].signerName).toBe("Marie Dupont");
  });

  it("leaves SIGNED row signerName null when no event carries one (no fabrication)", () => {
    const rows = buildRows([sent], "SIGNED");
    expect(rows[rows.length - 1].signerName).toBeNull();
  });

  it("does not append a SIGNED row when status is DRAFT or SENT", () => {
    expect(buildRows([sent], "SENT").some((r) => r.type === "SIGNED")).toBe(false);
    expect(buildRows([], "DRAFT").some((r) => r.type === "SIGNED")).toBe(false);
  });
});

describe("splitOverflow", () => {
  const rows = buildRows(
    Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      type: "VIEWED" as const,
      occurredAt: `2026-06-13T${String(i).padStart(2, "0")}:00:00.000Z`,
    })),
    "SENT",
  );

  it("returns all rows with zero overflow when under the limit", () => {
    const { visible, overflow } = splitOverflow(rows.slice(0, 5), 8);
    expect(visible).toHaveLength(5);
    expect(overflow).toBe(0);
  });

  it("keeps the most recent rows and reports the overflow count", () => {
    const { visible, overflow } = splitOverflow(rows, 8);
    expect(visible).toHaveLength(8);
    expect(overflow).toBe(2);
    // Most recent kept (the last of the original list).
    expect(visible[visible.length - 1].key).toBe("e9");
  });
});

describe("formatTimestamp", () => {
  it("formats an ISO date as fr-FR 'dd MMM yyyy à HH:mm'", () => {
    const out = formatTimestamp("2026-06-13T09:05:00.000Z");
    // Locale-dependent month/time, but the 'à' separator (comma replacement) must be present.
    expect(out).toContain(" à ");
    expect(out).not.toContain(",");
  });
});
