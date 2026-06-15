import { randomBytes, createHash } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { SignJWT } from "jose";
import { basePrisma } from "@kessel/db";

// PortalAuthService (PORT-01) — génération + exchange magic link portail client.
//
// Sécurité :
//  - T-4-token-log : token brut JAMAIS loggé, seul le hash SHA-256 est stocké en DB.
//  - T-4-replay : updateMany WHERE usedAt IS NULL => single-use atomique (anti race condition).
//  - T-4-idor : issueMagicLink vérifie que le contact appartient à l'org de l'agence.
//  - T-4-enum : exchangeToken retourne null pour tout cas invalide (401 uniforme dans le controller).
//
// PortalSession est HORS SCOPED_MODELS (scopée via parent Contact.orgId) => utiliser basePrisma
// uniquement, JAMAIS forOrg (Pitfall 1 — recherche 04-RESEARCH.md Pattern 1).

@Injectable()
export class PortalAuthService {
  /** Génère un token opaque à forte entropie (256 bits, base64url). */
  generateMagicToken(): string {
    return randomBytes(32).toString("base64url");
  }

  /** Hash SHA-256 (hex) du token — seul ce hash est stocké en DB. */
  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Émet un magic link pour un contact appartenant à l'org (anti-IDOR T-4-idor).
   * Retourne le lien complet (token brut dans l'URL, jamais loggé).
   */
  async issueMagicLink(contactId: string, orgId: string): Promise<{ link: string }> {
    // Anti-IDOR : vérifier que le contact appartient bien à l'org de l'agence.
    const contact = await basePrisma.contact.findFirst({ where: { id: contactId, orgId } });
    if (!contact) {
      throw new NotFoundException("Contact not found in this organization");
    }

    const token = this.generateMagicToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000); // TTL 24h

    await basePrisma.portalSession.create({
      data: { contactId, tokenHash, expiresAt },
    });

    // Token brut UNIQUEMENT dans l'URL retournée — jamais dans les logs (T-4-token-log).
    const link = `${process.env.PORTAL_APP_URL}/?token=${token}`;
    return { link };
  }

  /**
   * Échange un magic link token contre un JWT cookie portail.
   * Retourne le JWT signé, ou null pour tout cas invalide (401 uniforme — T-4-enum).
   * Single-use atomique via updateMany WHERE usedAt IS NULL (T-4-replay).
   */
  async exchangeToken(token: string): Promise<string | null> {
    const hash = this.hashToken(token);

    const session = await basePrisma.portalSession.findUnique({ where: { tokenHash: hash } });

    // 401 uniforme : token inconnu, expiré ou déjà utilisé — même réponse (T-4-enum).
    if (!session || session.expiresAt < new Date() || session.usedAt) {
      return null;
    }

    // Race safety (T-4-replay) : updateMany atomique WHERE usedAt IS NULL.
    // Si un concurrent a déjà positionné usedAt, count === 0 => return null.
    const updated = await basePrisma.portalSession.updateMany({
      where: { tokenHash: hash, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (updated.count === 0) {
      return null;
    }

    // Récupérer orgId via le parent Contact (PortalSession scopée-via-parent, hors SCOPED_MODELS).
    const contact = await basePrisma.contact.findUnique({ where: { id: session.contactId } });
    if (!contact) {
      return null;
    }

    return this.mintPortalJwt(contact.id, contact.orgId);
  }

  /**
   * Signe un JWT portail HS256 avec le secret dédié (T-4-jwt-secret).
   * Claims : role=client, contactId, orgId, scope=client-portal, exp=7j.
   */
  async mintPortalJwt(contactId: string, orgId: string): Promise<string> {
    const secret = new TextEncoder().encode(process.env.PORTAL_JWT_SECRET);
    return new SignJWT({ role: "client", contactId, orgId, scope: "client-portal" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .setIssuedAt()
      .sign(secret);
  }
}
