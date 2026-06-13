// Share token public (DELIV-01) — génération + hash. crypto stdlib uniquement (zéro dépendance).
//
// Sécurité (T-5-token) : le token est le SECRET d'accès au lien public `/p/:token`. On en génère
// 32 octets aléatoires (256 bits d'entropie -> non énumérable, pas un id devinable) encodés en
// base64url (URL-safe : pas de +,/,=). On ne stocke JAMAIS le token brut en DB : seul son hash
// SHA-256 est destiné à la colonne `Proposal.shareTokenHash @unique`. Un dump DB ne révèle donc
// aucun token utilisable. SHA-256 sans sel suffit ici : le token est déjà 256 bits aléatoires
// (pas un secret à faible entropie -> ni brute-force ni rainbow table possible ; bcrypt/argon2
// sont réservés aux mots de passe humains à faible entropie).
import { randomBytes, createHash } from "node:crypto";

/**
 * Génère un share token opaque à forte entropie (256 bits, base64url URL-safe).
 * Le token brut n'est exposé qu'à l'envoi (URL `/p/:token`) — jamais persisté tel quel.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash SHA-256 (hex) du token, destiné au stockage (`Proposal.shareTokenHash`) et au lookup public.
 * Déterministe : un même token donne toujours le même hash (lookup O(1) sur l'index @unique).
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
