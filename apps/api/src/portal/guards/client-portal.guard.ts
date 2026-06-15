import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { jwtVerify } from "jose";
import { extractPortalCookie } from "../portal-cookie";

// ClientPortalGuard (PORT-01) — vérifie le JWT cookie portal_session.
//
// Sécurité (T-4-enum) : 401 uniforme dans TOUS les cas (cookie absent, JWT invalide, expiré,
// claims manquants, scope incorrect). AUCUNE distinction de la cause — anti-énumération.
// T-4-cookie-xss : le cookie est HttpOnly (posé par buildPortalCookie), inaccessible JS.

/** Identité portail client injectée dans la requête après vérification du JWT. */
export type PortalContact = {
  contactId: string;
  orgId: string;
};

// Extension du type Request pour inclure portalContact (typé, pas any).
interface RequestWithPortalContact {
  headers: { cookie?: string; authorization?: string };
  portalContact?: PortalContact;
}

@Injectable()
export class ClientPortalGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPortalContact>();

    // Extraire le token : cookie portal_session EN PRIORITÉ, sinon Authorization: Bearer (tests e2e).
    // T-4-enum : 401 uniforme si aucun token présent.
    const cookieToken = extractPortalCookie(request);
    const bearerToken = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : undefined;
    const token = cookieToken ?? bearerToken;
    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const secret = new TextEncoder().encode(process.env.PORTAL_JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);

      // Vérifier scope + claims obligatoires (T-4-enum : erreur de claims = même 401).
      if (
        payload.scope !== "client-portal" ||
        !payload.contactId ||
        !payload.orgId
      ) {
        throw new Error("invalid claims");
      }

      // Injecter l'identité portail dans la requête pour les controllers descendants.
      request.portalContact = {
        contactId: payload.contactId as string,
        orgId: payload.orgId as string,
      };

      return true;
    } catch {
      // JWT invalide, expiré, signature incorrecte, claims invalides => 401 uniforme (T-4-enum).
      throw new UnauthorizedException();
    }
  }
}
