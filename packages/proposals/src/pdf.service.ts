import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import puppeteer, { type Browser } from "puppeteer";
import { generateHTML } from "@tiptap/html";
import { PROPOSAL_EXTENSIONS } from "@kessel/shared";
import type { QuoteLineDto, VatTotalsDto } from "@kessel/shared";
import { wrapTemplate, type PdfTemplateLine } from "./pdf-template";

// PdfService — rend une proposition en PDF FIDÈLE à l'éditeur (PROP-07).
//
// FIDÉLITÉ (clé) : le corps est rendu par generateHTML(bodyJson, PROPOSAL_EXTENSIONS) — la MÊME liste
// d'extensions Tiptap que l'éditeur web (source unique @kessel/shared). Le serveur produit donc le
// MÊME HTML que l'éditeur, zéro dérive. Le wrapper ajoute header org + tableau devis + total.
//
// PERF (Pitfall 3 / T-3-pdf-dos) : UNE instance Browser réutilisée (OnModuleInit/Destroy) — pas de
// launch() par requête (~300ms). Chaque rendu ouvre/ferme une page (page.close() en finally).
//
// SÉCURITÉ : args --no-sandbox/--disable-setuid-sandbox (requis en conteneur, T-3-pdf-sandbox) ;
// executablePath via PUPPETEER_EXECUTABLE_PATH en Docker (Chromium apt), sinon Chromium bundlé en dev.
// setContent(html, {waitUntil:"load"}) — HTML AUTONOME inline, JAMAIS de navigation vers une URL externe (T-3-pdf-ssrf).

// Montant -> "12,35 €" (fr-FR, EUR). Les valeurs arrivent en string (Decimal->string au boundary).
const EUR = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function formatEur(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? EUR.format(n) : amount;
}

// Date du jour formatée fr-FR (ex "13 juin 2026") pour le header du PDF.
function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

// Entrées de rendu : tout ce que le service a besoin pour produire le document (issu de getProposal
// + nom de l'org). bodyJson est un document ProseMirror org-owned ; montants en string.
export interface RenderProposalInput {
  title: string;
  bodyJson: unknown;
  lines: QuoteLineDto[];
  grandTotal: string;
  vatTotals?: VatTotalsDto; // bloc HT/TVA/TTC + mention légale (TVA-02/03/04)
  org: { name: string };
}

@Injectable()
export class PdfService implements OnModuleInit, OnModuleDestroy {
  private browser: Browser | undefined;

  async onModuleInit(): Promise<void> {
    // En Docker : Chromium système (apt). En dev hôte : undefined -> Chromium téléchargé par Puppeteer.
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }

  // Rend le PDF d'une proposition. Retourne le PDF en Buffer (commence par les octets "%PDF").
  async renderProposalPdf(input: RenderProposalInput): Promise<Buffer> {
    if (!this.browser) {
      throw new Error("PdfService: browser non initialisé (onModuleInit non appelé).");
    }

    // FIDÉLITÉ : même extensions que l'éditeur -> même HTML. bodyJson est un doc ProseMirror valide.
    const bodyHtml = generateHTML(input.bodyJson as never, PROPOSAL_EXTENSIONS as never);

    const templateLines: PdfTemplateLine[] = input.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPriceFormatted: formatEur(l.unitPrice),
      lineTotalFormatted: formatEur(l.lineTotal),
    }));

    const html = wrapTemplate({
      orgName: input.org.name,
      date: formatDateFr(new Date()),
      title: input.title,
      bodyHtml,
      lines: templateLines,
      grandTotalFormatted: formatEur(input.grandTotal),
      vatTotals: input.vatTotals,
    });

    const page = await this.browser.newPage();
    try {
      // HTML autonome inline (CSS inline, aucune ressource réseau) -> "load" suffit (Pitfall 3).
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }
}
