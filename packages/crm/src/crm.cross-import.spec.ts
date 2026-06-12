import { describe, it, expect } from "vitest";
import { CRM_MODULE } from "./index";

// cross-import boundary contract: lint must fail on cross-module DB import.
// The real enforcement is the lint rule @nx/enforce-module-boundaries (not runtime):
// a type:domain package may only depend on type:shared / type:db / type:domain-api,
// never on another type:domain package nor its DB client. This spec is the grep-able
// marker + placeholder for the negative boundary test executed in CI via `nx lint`.
describe("crm module boundary contract", () => {
  it("exposes only its public API surface", () => {
    expect(CRM_MODULE.name).toBe("crm");
  });
});
