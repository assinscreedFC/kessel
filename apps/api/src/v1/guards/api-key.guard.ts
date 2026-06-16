import { createHash } from "node:crypto";
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { basePrisma } from "@kessel/db";

// ApiKeyGuard (API-02) — authentifie les requêtes API v1 via Bearer ksl_live_ + SHA-256 lookup.
//
// Sécurité :
//  - T-5-enum : 401 UNIFORME pour toute failure (clé absente, mauvais préfixe, inconnue, révoquée).
//    Aucun 404, aucun message distinct — anti-énumération stricte.
//  - T-5-apikey : rawKey jamais loggé ; keyHash jamais loggé.
//  - Guard lookup global (basePrisma) car keyHash est @unique sans orgId : on ne peut pas
//    utiliser forOrg ici (le orgId est précisément ce qu'on cherche à résoudre).

/** Extension du type Request pour injecter l'identité API key (sans any). */
export interface RequestWithApiOrg {
  headers: {
    authorization?: string;
    [key: string]: string | string[] | undefined;
  };
  apiOrgId?: string;
  apiKeyHash?: string;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithApiOrg>();

    const auth = req.headers.authorization;

    // 401 uniforme si header manquant ou format incorrect (T-5-enum).
    if (!auth?.startsWith("Bearer ksl_live_")) {
      throw new UnauthorizedException();
    }

    const rawKey = auth.slice(7); // supprime "Bearer "
    // Hash SHA-256 pour le lookup — rawKey jamais persisté/loggé (T-5-apikey).
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const apiKey = await basePrisma.apiKey.findUnique({ where: { keyHash } });

    // 401 uniforme : clé inconnue OU clé révoquée → même réponse (T-5-enum).
    if (!apiKey || apiKey.revokedAt !== null) {
      throw new UnauthorizedException();
    }

    // Injecter l'identité sur la requête pour les controllers et le throttler.
    req.apiOrgId = apiKey.orgId;
    req.apiKeyHash = keyHash;

    return true;
  }
}
