import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

// webhook-crypto.ts — AES-256-GCM chiffrement/déchiffrement réversible des secrets webhook.
//
// Sécurité (T-5-01/T-5-02/T-5-03) :
//  - Clé dérivée LAZILY à chaque appel (process.env lu à l'exécution, jamais au module top-level).
//  - IV de 12 bytes (96 bits) aléatoires par chiffrement (T-5-pitfall-5 : jamais fixe).
//  - Format stocké "iv:authTag:ciphertext" (tout en hex) — 3 segments séparés par ':'.
//  - GCM authTag (16 bytes) vérifié à chaque déchiffrement : intégrité garantie.
//  - Clé JAMAIS loggée (T-5-03) — dérivée en fonction locale uniquement.

const ALGO = "aes-256-gcm" as const;

function deriveKey(): Buffer {
  const hex = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("WEBHOOK_ENCRYPTION_KEY is not set — required for webhook secret encryption");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `WEBHOOK_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes), got ${key.length} bytes`,
    );
  }
  return key;
}

/**
 * Chiffre un secret webhook en AES-256-GCM avec un IV aléatoire par appel.
 * Retourne une chaîne "iv:authTag:ciphertext" (tout en hex), prête à persister en DB.
 */
export function encryptWebhookSecret(plain: string): string {
  const key = deriveKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes GCM auth tag
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Déchiffre un secret webhook stocké au format "iv:authTag:ciphertext" (hex).
 * Lève si l'authTag est altéré (GCM integrity check) ou si le format est invalide.
 */
export function decryptWebhookSecret(stored: string): string {
  const key = deriveKey();
  const parts = stored.split(":");
  if (parts.length !== 3) {
    throw new Error(`Invalid stored format: expected "iv:authTag:ciphertext", got ${parts.length} segments`);
  }
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
