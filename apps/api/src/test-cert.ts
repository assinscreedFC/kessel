import { writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";

// Helper de TEST UNIQUEMENT (DELIV-03) — génère un certificat PKCS#12 self-signed RÉEL, réutilisable
// dans les specs de signature PAdES. Crypto réelle de bout en bout (jamais simulée) : la signature PDF
// est testée pour de vrai (comme le PDF Chromium de Phase 3), car une erreur de signature produit un
// artefact qui SEMBLE signé mais ne valide pas. La génération in-process via node-forge (clé RSA 2048 + cert X.509
// self-signed CN=Kessel Test + export .p12) évite toute dépendance à un binaire openssl externe ->
// déterministe sur hôte/CI/conteneur (node-forge est déjà une dépendance transitive du @signpdf/signer-p12).
//
// PRODUCTION : le cert de prod NE vient PAS d'ici — il est fourni via SIGNING_P12_PATH / SIGNING_P12_PASSPHRASE
// (env, jamais commité, jamais loggé). Ce helper sert exclusivement le harness de test.

// Passphrase FIXE de test (pas un secret de prod — un cert self-signed de test en tmpdir).
const TEST_P12_PASSPHRASE = "kessel-test-p12";
const TEST_P12_FILENAME = "kessel-test-signing.p12";

export interface TestP12 {
  /** Chemin absolu du .p12 généré (dans os.tmpdir()). */
  p12Path: string;
  /** Passphrase du .p12 (fixe, de test). */
  passphrase: string;
}

/**
 * Génère (ou réutilise) un certificat PKCS#12 self-signed de test et l'écrit dans os.tmpdir().
 * Idempotent : si le .p12 existe déjà, on le réutilise (évite de régénérer à chaque spec).
 *
 * @returns le chemin du .p12 et sa passphrase, à passer à un P12Signer dans les specs signing.
 */
export function generateTestP12(): TestP12 {
  const p12Path = join(tmpdir(), TEST_P12_FILENAME);

  if (existsSync(p12Path)) {
    return { p12Path, passphrase: TEST_P12_PASSPHRASE };
  }

  // 1. Paire de clés RSA 2048 (real crypto node-forge).
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // 2. Certificat X.509 v3 self-signed (CN=Kessel Test), validité 10 ans.
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  const attrs = [
    { name: "commonName", value: "Kessel Test" },
    { name: "organizationName", value: "Kessel" },
    { name: "countryName", value: "FR" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed : issuer == subject
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // 3. Export PKCS#12 (clé privée + cert, chiffré par la passphrase) en DER binaire.
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], TEST_P12_PASSPHRASE, {
    algorithm: "3des",
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  writeFileSync(p12Path, Buffer.from(p12Der, "binary"));

  return { p12Path, passphrase: TEST_P12_PASSPHRASE };
}
