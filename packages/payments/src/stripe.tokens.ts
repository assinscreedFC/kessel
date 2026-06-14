// Stripe DI token + interface + payment token helpers (PAY-02, Phase 3).
//
// FOUND-05 compliant: ce fichier est une copie locale du pattern token.ts de @kessel/proposals.
// @kessel/payments N'IMPORTE PAS @kessel/proposals — l'orchestration cross-domaine est réservée à
// apps/api. Les helpers generatePaymentToken/hashPaymentToken sont identiques à generateShareToken/
// hashToken (même crypto stdlib, même sécurité T-3-enum) mais nommés séparément pour éviter
// toute dépendance inter-domaine.
import { randomBytes, createHash } from "node:crypto";

/**
 * DI token NestJS pour le client Stripe injecté (@Inject(STRIPE_CLIENT)).
 * Découple PaymentService de la classe Stripe concrète → les e2e injectent un stub.
 */
export const STRIPE_CLIENT = Symbol("STRIPE_CLIENT");

/**
 * Interface minimale du client Stripe utilisé par PaymentService.
 * Seuls les sous-objets/méthodes effectivement appelés sont typés ici.
 * Les e2e stubent cette interface (pas le SDK Stripe entier).
 */
export interface StripeLike {
  paymentIntents: {
    create(params: {
      amount: number;
      currency: string;
      metadata?: Record<string, string>;
    }): Promise<{ id: string; client_secret: string | null }>;
  };
  webhooks: {
    constructEvent(
      payload: string | Buffer,
      header: string,
      secret: string,
    ): { id: string; type: string; data: { object: unknown } };
    generateTestHeaderString(opts: {
      payload: string;
      secret: string;
    }): string;
  };
}

/**
 * Génère un payment token opaque à forte entropie (256 bits, base64url URL-safe).
 * Le token brut n'est exposé qu'au client via le lien de paiement — jamais persisté tel quel.
 */
export function generatePaymentToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash SHA-256 (hex) du payment token, destiné au stockage (Payment.paymentTokenHash @unique)
 * et au lookup public O(1) (basePrisma.findUnique, pas forOrg — T-3-enum).
 */
export function hashPaymentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
