import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";

// SigningService — signe un PDF en PAdES (équivalent Documenso, DELIV-03) avec un cert PKCS#12.
//
// FLUX (RESEARCH §Pattern 5, vérifié) : PDFDocument.load -> pdflibAddPlaceholder (champ signature +
// ByteRange, subFilter SUBFILTER_ETSI_CADES_DETACHED = PAdES) -> P12Signer (cert PKCS#12) ->
// SignPdf().sign (embed la signature CMS détachée dans le ByteRange) -> documentHash SHA-256.
// Le PDF de sortie a un champ signature VÉRIFIABLE (pas un flag booléen) : une erreur de signature
// produit un artefact qui SEMBLE signé mais ne valide pas — d'où le test "pour de vrai" (cert réel).
//
// SÉCURITÉ (T-5-cert / V7) : le cert + la passphrase entrent UNIQUEMENT par env (SIGNING_P12_PATH /
// SIGNING_P12_PASSPHRASE), jamais en dur. Cert absent/illisible -> SigningCertNotConfiguredError
// (erreur typée, message SANS secret ni stack trace ENOENT). La passphrase n'est JAMAIS loggée, ni
// le buffer p12 (aucun console.* dans ce fichier).

// Erreur typée levée quand le certificat de signature n'est pas configuré/lisible. Le controller la
// mappe en 503 (configuration serveur), pas un 500/stack trace. Message volontairement générique
// (n'expose ni le chemin réel, ni la passphrase, ni le détail ENOENT).
export class SigningCertNotConfiguredError extends Error {
  constructor() {
    super("signing certificate not configured");
    this.name = "SigningCertNotConfiguredError";
  }
}

export interface SignerIdentity {
  name: string;
  email: string;
}

export interface SignResult {
  signedPdf: Buffer;
  documentHash: string;
}

@Injectable()
export class SigningService {
  // Charge le cert PKCS#12 depuis SIGNING_P12_PATH + sa passphrase SIGNING_P12_PASSPHRASE (env only).
  // Path absent/illisible -> SigningCertNotConfiguredError (jamais de stack ENOENT exposée, jamais de
  // passphrase loggée). La passphrase peut être vide (cert sans passphrase) — on tolère "".
  loadCert(): { p12: Buffer; passphrase: string } {
    const p12Path = process.env.SIGNING_P12_PATH;
    if (!p12Path) {
      throw new SigningCertNotConfiguredError();
    }
    let p12: Buffer;
    try {
      p12 = readFileSync(p12Path);
    } catch {
      // On AVALE l'erreur fs (ENOENT/EACCES) volontairement : ne JAMAIS propager le détail système
      // (chemin, errno) au client. On relève une erreur typée générique.
      throw new SigningCertNotConfiguredError();
    }
    return { p12, passphrase: process.env.SIGNING_P12_PASSPHRASE ?? "" };
  }

  // Signe pdfBuffer avec le cert p12 (PAdES). signer alimente reason/contactInfo/name du placeholder.
  // passphrase fausse / p12 invalide -> l'erreur de @signpdf/signer-p12 est propagée telle quelle
  // (typée, pas un crash silencieux) — le caller la traite. La passphrase n'est jamais loggée.
  async signPdf(
    pdfBuffer: Buffer,
    p12: Buffer,
    passphrase: string,
    signer: SignerIdentity,
  ): Promise<SignResult> {
    // 1. Placeholder via pdf-lib : insère le champ signature + ByteRange (PAdES SUBFILTER_ETSI_CADES).
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    pdflibAddPlaceholder({
      pdfDoc: pdfDoc as never,
      reason: `Signé par ${signer.name} (${signer.email})`,
      contactInfo: signer.email,
      name: signer.name,
      location: "Kessel e-sign",
      subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    });
    const withPlaceholder = Buffer.from(await pdfDoc.save());

    // 2. Signataire PKCS#12 (node-forge sous le capot). passphrase fausse -> throw typé ici.
    const p12Signer = new P12Signer(p12, { passphrase });

    // 3. Embed la signature CMS détachée dans le ByteRange -> PDF signé vérifiable.
    const signedPdf = await new SignPdf().sign(withPlaceholder, p12Signer);
    const documentHash = createHash("sha256").update(signedPdf).digest("hex");

    return { signedPdf, documentHash };
  }

  // Convenience : charge le cert (env) puis signe. Cert absent -> SigningCertNotConfiguredError.
  async signWithConfiguredCert(pdfBuffer: Buffer, signer: SignerIdentity): Promise<SignResult> {
    const { p12, passphrase } = this.loadCert();
    return this.signPdf(pdfBuffer, p12, passphrase, signer);
  }
}
