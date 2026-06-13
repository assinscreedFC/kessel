import { describe, expect, it } from "vitest";
import { generateShareToken, hashToken } from "./token";

// Token public (DELIV-01, T-5-token). Real crypto stdlib, aucun mock.
// Prouve l'entropie (2 appels distincts), le format base64url, le déterminisme du hash,
// et l'invariant de sécurité central : le hash ne contient JAMAIS le token brut (DB dump safe).

describe("token: generateShareToken", () => {
  it("renvoie une string base64url (URL-safe, pas de +,/,=)", () => {
    const token = generateShareToken();
    expect(typeof token).toBe("string");
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("encode 32 octets -> ~43 caractères base64url (256 bits d'entropie)", () => {
    const token = generateShareToken();
    // 32 octets en base64url sans padding = 43 caractères.
    expect(token.length).toBe(43);
  });

  it("deux appels donnent deux tokens distincts (entropie, non devinable)", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toBe(b);
  });
});

describe("token: hashToken", () => {
  it("renvoie 64 caractères hexadécimaux (SHA-256)", () => {
    const hash = hashToken(generateShareToken());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("est déterministe : même token -> même hash (lookup par hash)", () => {
    const token = generateShareToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("deux tokens distincts donnent deux hashs distincts", () => {
    const h1 = hashToken(generateShareToken());
    const h2 = hashToken(generateShareToken());
    expect(h1).not.toBe(h2);
  });

  it("le hash ne contient JAMAIS le token brut (un dump DB ne révèle pas de token utilisable)", () => {
    const token = generateShareToken();
    const hash = hashToken(token);
    expect(hash.includes(token)).toBe(false);
    expect(hash).not.toBe(token);
  });
});
