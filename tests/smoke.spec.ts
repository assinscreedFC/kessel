import { describe, it, expect } from "vitest";

// Test 1 (Wave 0): confirms the vitest toolchain is operational.
describe("vitest smoke", () => {
  it("runs a trivial assertion", () => {
    expect(1 + 1).toBe(2);
  });
});
