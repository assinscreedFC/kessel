// pdf-template.ts — wrapper HTML AUTONOME (CSS inline, AUCUN fetch externe) pour l'export PDF
// (PROP-07). Reproduit le layout 03-UI-SPEC "PDF document layout" : header (org + date fr-FR +
// hairline), titre, corps Tiptap rendu (bodyHtml — déjà échappé par generateHTML), section DEVIS
// (omise si 0 ligne), footer org. A4 portrait, esthétique slate/system-font de l'app.
//
// SÉCURITÉ (V12 / T-3-pdf-xss) : orgName et chaque description sont des champs HORS-éditeur — ils
// sont échappés via escapeHtml AVANT injection. bodyHtml vient de generateHTML(@tiptap/html) qui rend
// un schéma Tiptap CONTRÔLÉ (texte des nœuds échappé, pas de <script> arbitraire) -> sûr tel quel.
//
// SSRF (T-3-pdf-ssrf) : ZÉRO ressource externe (pas de <link>, <img src=http>, @import url) — le CSS
// est inline et le HTML autonome, rendu via page.setContent(...{waitUntil:"load"}), jamais de navigation URL.

// Montant déjà formaté (EUR fr-FR) par le service — le template ne refait pas le calcul/format.
export interface PdfTemplateLine {
  description: string;
  quantity: string; // affichage brut (ex "3", "0.5")
  unitPriceFormatted: string; // ex "12,35 €"
  lineTotalFormatted: string; // ex "37,05 €"
}

export interface PdfTemplateInput {
  orgName: string;
  date: string; // déjà formaté fr-FR (ex "13 juin 2026")
  title: string;
  bodyHtml: string; // sortie generateHTML — déjà sûre (schéma Tiptap contrôlé)
  lines: PdfTemplateLine[];
  grandTotalFormatted: string; // ex "37,15 €"
}

// Échappe les 5 caractères HTML sensibles. Appliqué à TOUT champ hors-éditeur (orgName, description,
// title) injecté dans le HTML. bodyHtml en est EXCLU (déjà échappé par generateHTML).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderQuoteSection(lines: PdfTemplateLine[], grandTotalFormatted: string): string {
  // DEVIS omis entièrement si 0 ligne (03-UI-SPEC : pas de table vide ni de total "0,00 €").
  if (lines.length === 0) {
    return "";
  }
  const rows = lines
    .map(
      (l) => `
        <tr>
          <td class="desc">${escapeHtml(l.description)}</td>
          <td class="num">${escapeHtml(l.quantity)}</td>
          <td class="num">${escapeHtml(l.unitPriceFormatted)}</td>
          <td class="num">${escapeHtml(l.lineTotalFormatted)}</td>
        </tr>`,
    )
    .join("");
  return `
    <section class="devis">
      <div class="devis-label">DEVIS</div>
      <table>
        <thead>
          <tr>
            <th class="desc">Description</th>
            <th class="num">Qté</th>
            <th class="num">Prix unit.</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td class="total-label" colspan="3">Total</td>
            <td class="num total-value">${escapeHtml(grandTotalFormatted)}</td>
          </tr>
        </tfoot>
      </table>
    </section>`;
}

// Construit le document HTML complet imprimé par Puppeteer (A4, printBackground). CSS 100% inline.
export function wrapTemplate(input: PdfTemplateInput): string {
  const { orgName, date, title, bodyHtml, lines, grandTotalFormatted } = input;
  const safeOrg = escapeHtml(orgName);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a; /* slate-900 */
    font-size: 12px;
    line-height: 1.6;
  }
  .page { padding: 32px 40px; }
  .header { display: flex; justify-content: space-between; align-items: baseline; }
  .header .org { font-weight: 600; font-size: 13px; color: #0f172a; }
  .header .date { color: #64748b; font-size: 11px; } /* slate-500 */
  .hairline { border: 0; border-top: 1px solid #e2e8f0; margin: 10px 0 24px; } /* slate-200 */
  h1.title { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 20px; }
  .body h1 { font-size: 18px; font-weight: 600; margin: 18px 0 8px; }
  .body h2 { font-size: 15px; font-weight: 600; margin: 16px 0 6px; }
  .body h3 { font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
  .body p { margin: 0 0 10px; }
  .body ul, .body ol { margin: 0 0 10px 20px; padding: 0; }
  .body a { color: #2563eb; text-decoration: underline; }
  .devis { margin-top: 28px; }
  .devis-label { text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; color: #64748b; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  thead th { text-align: left; font-size: 10px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
  tbody td { padding: 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  td.desc, th.desc { text-align: left; }
  tfoot .total-label { text-align: right; font-weight: 600; padding: 12px 8px 0; }
  tfoot .total-value { font-weight: 700; color: #0f172a; padding: 12px 8px 0; font-size: 13px; }
  .footer { margin-top: 40px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 10px; }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <span class="org">${safeOrg}</span>
      <span class="date">${escapeHtml(date)}</span>
    </div>
    <hr class="hairline" />
    <h1 class="title">${escapeHtml(title)}</h1>
    <div class="body">${bodyHtml}</div>
    ${renderQuoteSection(lines, grandTotalFormatted)}
    <div class="footer">${safeOrg}</div>
  </div>
</body>
</html>`;
}
