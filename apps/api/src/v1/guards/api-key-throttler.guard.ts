import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

// ApiKeyThrottlerGuard (API-02) — rate limiting par clé API (keyHash comme identifiant de bucket).
//
// Raison : ThrottlerGuard de base utilise l'IP comme tracker.
// On l'override pour utiliser `req.apiKeyHash` (injecté par ApiKeyGuard, exécuté en premier).
// Fallback sur req.ip si apiKeyHash absent (ne devrait pas arriver en prod, mais évite panic).
//
// Ordre des guards (impératif) : @UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard) — ApiKeyGuard
// DOIT s'exécuter en premier pour que req.apiKeyHash soit disponible ici.

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    // req.apiKeyHash posé par ApiKeyGuard (exécuté avant ce guard dans la chaîne @UseGuards).
    return (req as { apiKeyHash?: string }).apiKeyHash ?? (req["ip"] as string);
  }
}
