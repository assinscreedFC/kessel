import { beforeAll, describe, expect, it } from "vitest";

// webhook-crypto.spec.ts — AES-256-GCM unit tests (no DB, no network).
// Couvre T-5-01 : chiffrement at-rest du secret webhook avec IV aléatoire par appel.
//
// Behaviors tested:
//  (a) round-trip : decrypt(encrypt(plain)) === plain (UTF-8 incl. accents/emoji).
//  (b) non-determinism : deux encrypts du même plaintext donnent des ciphertexts différents (IV aléatoire).
//  (c) format : iv(24 hex):authTag(32 hex):ciphertext(hex) — exactement 3 segments séparés par ':'.
//  (d) integrity : decrypt lève si l'authTag est altéré (GCM integrity check).

describe("webhook-crypto (AES-256-GCM, unit — no DB)", () => {
  beforeAll(() => {
    // Clé de test déterministe (64 hex = 32 bytes). Jamais une vraie clé.
    process.env.WEBHOOK_ENCRYPTION_KEY = "a".repeat(64);
  });

  it("(a) round-trip UTF-8 plain -> encrypt -> decrypt === original", async () => {
    const { encryptWebhookSecret, decryptWebhookSecret } = await import("./webhook-crypto");
    const plain = "my-webhook-secret-with-accents-éàü-and-emoji-🔑";
    const stored = encryptWebhookSecret(plain);
    const recovered = decryptWebhookSecret(stored);
    expect(recovered).toBe(plain);
  });

  it("(b) two encrypts of the same plaintext produce different ciphertexts (random IV per call)", async () => {
    const { encryptWebhookSecret } = await import("./webhook-crypto");
    const plain = "same-secret";
    const ct1 = encryptWebhookSecret(plain);
    const ct2 = encryptWebhookSecret(plain);
    expect(ct1).not.toBe(ct2);
  });

  it("(c) stored format is exactly 3 colon-separated hex segments: iv(24):authTag(32):ciphertext(hex)", async () => {
    const { encryptWebhookSecret } = await import("./webhook-crypto");
    const stored = encryptWebhookSecret("test-secret");
    const parts = stored.split(":");
    expect(parts).toHaveLength(3);
    const [ivHex, tagHex, ctHex] = parts;
    // IV = 12 bytes = 24 hex chars
    expect(ivHex).toMatch(/^[0-9a-f]{24}$/);
    // authTag = 16 bytes = 32 hex chars
    expect(tagHex).toMatch(/^[0-9a-f]{32}$/);
    // ciphertext = non-empty hex
    expect(ctHex).toMatch(/^[0-9a-f]+$/);
  });

  it("(d) decrypt throws if the authTag is tampered (GCM integrity check)", async () => {
    const { encryptWebhookSecret, decryptWebhookSecret } = await import("./webhook-crypto");
    const stored = encryptWebhookSecret("tamper-me");
    const parts = stored.split(":");
    // Flip one char in the authTag (second segment)
    const tamperedTag = parts[1].slice(0, -1) + (parts[1].endsWith("f") ? "0" : "f");
    const tampered = [parts[0], tamperedTag, parts[2]].join(":");
    expect(() => decryptWebhookSecret(tampered)).toThrow();
  });
});
