import { describe, expect, it } from "vitest";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { SigningService, SigningCertNotConfiguredError } from "./signing.service";

// Spec UNITAIRE de la signature PAdES (DELIV-03) — cert PKCS#12 RÉEL (generateTestP12, node-forge),
// AUCUNE I/O simulée de la signature, SANS MinIO ni harness e2e. C'est le cœur sécurité testé en
// isolation AVANT l'e2e : une erreur de signature produit un artefact qui SEMBLE signé mais ne valide
// pas, donc on asserte la présence RÉELLE du champ signature (ByteRange + SubFilter) dans le buffer
// de sortie — pas un flag booléen. La passphrase fausse doit lever une erreur typée (pas un crash).

const TEST_PASSPHRASE = "kessel-unit-p12";

// Génère un cert PKCS#12 self-signed RÉEL en mémoire (clé RSA 2048 + X.509 + export .p12). Crypto
// réelle de bout en bout (jamais simulée) — exactement ce que parse P12Signer en prod. Renvoie le
// buffer .p12 (DER) directement (pas de fichier tmp : ce spec est pur, sans fs).
function generateTestP12(passphrase: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  const attrs = [
    { name: "commonName", value: "Kessel Unit Test" },
    { name: "organizationName", value: "Kessel" },
    { name: "countryName", value: "FR" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(der, "binary");
}

// PDF minimal %PDF (pdf-lib PDFDocument.create) — le document à signer.
async function minimalPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawText("Kessel proposition signable", { x: 50, y: 800, size: 12 });
  return Buffer.from(await doc.save());
}

describe("SigningService.signPdf (PAdES, cert réel — DELIV-03)", () => {
  it("signe un PDF et produit un champ signature VÉRIFIABLE (ByteRange + SubFilter) + documentHash 64 hex", async () => {
    const service = new SigningService();
    const p12 = generateTestP12(TEST_PASSPHRASE);
    const pdf = await minimalPdf();

    const { signedPdf, documentHash } = await service.signPdf(pdf, p12, TEST_PASSPHRASE, {
      name: "Alice Cliente",
      email: "alice@client.test",
    });

    // Le buffer signé commence par %PDF.
    expect(signedPdf.toString("utf8", 0, 4)).toBe("%PDF");
    // Champ signature présent (pas un flag) : ByteRange + SubFilter dans le PDF.
    const text = signedPdf.toString("latin1");
    expect(text).toContain("/ByteRange");
    expect(text).toContain("/SubFilter");
    // PAdES : ETSI.CAdES.detached (ou adbe.pkcs7.detached selon la version).
    expect(/ETSI\.CAdES\.detached|adbe\.pkcs7\.detached/.test(text)).toBe(true);
    // documentHash = SHA-256 hex (64 caractères).
    expect(documentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("passphrase fausse -> lève une erreur typée (pas un crash silencieux)", async () => {
    const service = new SigningService();
    const p12 = generateTestP12(TEST_PASSPHRASE);
    const pdf = await minimalPdf();

    await expect(
      service.signPdf(pdf, p12, "mauvaise-passphrase", { name: "X", email: "x@y.test" }),
    ).rejects.toThrow();
  });

  it("loadCert sans SIGNING_P12_PATH -> SigningCertNotConfiguredError (message sans secret)", () => {
    const service = new SigningService();
    const prev = process.env.SIGNING_P12_PATH;
    delete process.env.SIGNING_P12_PATH;
    try {
      expect(() => service.loadCert()).toThrow(SigningCertNotConfiguredError);
    } finally {
      if (prev !== undefined) process.env.SIGNING_P12_PATH = prev;
    }
  });

  it("loadCert avec un chemin illisible -> SigningCertNotConfiguredError (pas de stack ENOENT exposée)", () => {
    const service = new SigningService();
    const prev = process.env.SIGNING_P12_PATH;
    process.env.SIGNING_P12_PATH = "/chemin/inexistant/kessel-absent.p12";
    try {
      expect(() => service.loadCert()).toThrow(SigningCertNotConfiguredError);
    } finally {
      if (prev !== undefined) process.env.SIGNING_P12_PATH = prev;
      else delete process.env.SIGNING_P12_PATH;
    }
  });
});
