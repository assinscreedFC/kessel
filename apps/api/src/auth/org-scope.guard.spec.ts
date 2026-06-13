import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { OrgScopeGuard } from "./org-scope.guard";

// Wave 0 — RED stub. org-scope.guard.ts n'existe pas encore → DOIT échouer.
// L'implémentation est livrée en Wave 1, plan 04.
// Guard NestJS qui retourne 401 (UnauthorizedException) si activeOrganizationId absent.

// Différence avec requireOrg() (400 BadRequestException) :
// OrgScopeGuard lève 401 UnauthorizedException (non authentifié/non autorisé pour l'org).

function createMockContext(requestSession: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ session: requestSession }),
    }),
  } as unknown as ExecutionContext;
}

describe("OrgScopeGuard — 401 sans activeOrganizationId", () => {
  it("throw UnauthorizedException si session.session.activeOrganizationId absent", () => {
    // Arrange
    const guard = new OrgScopeGuard();
    const ctx = createMockContext({ session: {} });
    // Act / Assert
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("throw UnauthorizedException si session entièrement absente", () => {
    const guard = new OrgScopeGuard();
    const ctx = createMockContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("retourne true si activeOrganizationId présent", () => {
    // Arrange
    const guard = new OrgScopeGuard();
    const ctx = createMockContext({ session: { activeOrganizationId: "org-1" } });
    // Act
    const result = guard.canActivate(ctx);
    // Assert
    expect(result).toBe(true);
  });
});
