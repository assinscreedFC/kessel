import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { PROPOSAL_EXTENSIONS } from "@kessel/shared";
import { Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { formatEur } from "@/features/quote-builder/lib/totals";
import { downloadUnsignedPdf, type PublicProposal, type VatTotalsDto } from "../api";

// Rendu LECTURE SEULE de la proposition côté client public (DELIV-01). FIDÉLITÉ : on rend le bodyJson
// avec la MÊME liste PROPOSAL_EXTENSIONS (@kessel/shared) que l'éditeur opérateur (Phase 3) et que le
// generateHTML serveur du PDF -> le client voit EXACTEMENT ce que l'opérateur a écrit. On réutilise
// @tiptap/react en mode `editable: false` (déjà dep web) : aucune toolbar, aucun autosave, aucune
// affordance d'édition — c'est un document rendu, pas l'éditeur.
//
// Devis : table tabular-nums EUR fr-FR, total bold. DEVIS OMIS si 0 ligne (règle Phase 3 — pas de
// table vide ni de 0,00 €). Les liens du corps ouvrent dans un nouvel onglet (rel noopener noreferrer).

interface ProposalRenderProps {
  proposal: PublicProposal;
  token: string;
}

export function ProposalRender({ proposal, token }: ProposalRenderProps) {
  const hasLines = proposal.lines.length > 0;

  return (
    <div>
      <ReadOnlyBody bodyJson={proposal.bodyJson} />

      {hasLines && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Devis
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 text-left font-semibold">Description</th>
                <th className="py-2 text-right font-semibold">Qté</th>
                <th className="py-2 text-right font-semibold">Prix unit.</th>
                <th className="py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {proposal.lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="py-2 text-slate-900">{line.description}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{line.quantity}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">
                    {formatEur(line.unitPrice)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-900">
                    {formatEur(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-3 text-right text-sm font-semibold text-slate-900">
                  Total
                </td>
                <td className="py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                  {formatEur(proposal.grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {hasLines && <VatTotalsBlock vatTotals={proposal.vatTotals} />}

      <div className="mt-8">
        <Button variant="outline" onClick={() => downloadUnsignedPdf(token)}>
          <Download className="mr-2 h-4 w-4" />
          Télécharger le PDF
        </Button>
      </div>
    </div>
  );
}

// Bloc récapitulatif TVA (Surface 2 — 07-UI-SPEC). Inséré après la table devis.
// Montants via Intl.NumberFormat locale-aware (fr-FR ou en-GB selon i18n.language).
// NE PAS utiliser formatEur (hardcodé fr-FR, exception UI-SPEC — hors scope).
function VatTotalsBlock({ vatTotals }: { vatTotals: VatTotalsDto }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "en" ? "en-GB" : "fr-FR";

  function formatAmount(amount: string): string {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR",
    }).format(Number(amount));
  }

  return (
    <section
      aria-label="Récapitulatif TVA"
      className="mt-4 border-t border-slate-200 pt-4"
    >
      <table className="ml-auto max-w-xs w-full text-sm">
        <tbody>
          <tr>
            <td className="py-1 text-slate-600">{t("vat_totals.ht")}</td>
            <td className="py-1 text-right tabular-nums text-slate-900">
              {formatAmount(vatTotals.ht)}
            </td>
          </tr>
          {vatTotals.tva.map((entry) => (
            <tr key={entry.rate}>
              <td className="py-1 text-slate-600">
                {t("vat_totals.vat_rate", { rate: entry.rate })}
              </td>
              <td className="py-1 text-right tabular-nums text-slate-900">
                {formatAmount(entry.amount)}
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-1 font-semibold text-slate-900">{t("vat_totals.ttc")}</td>
            <td className="py-1 text-right font-semibold tabular-nums text-slate-900">
              {formatAmount(vatTotals.ttc)}
            </td>
          </tr>
        </tbody>
      </table>
      {vatTotals.legalMention && (
        <p className="mt-3 border-l-2 border-slate-200 pl-3 text-xs text-slate-500">
          {vatTotals.legalMention}
        </p>
      )}
    </section>
  );
}

// Corps Tiptap rendu en lecture seule. `editable: false` désactive toute édition ; on force les liens
// à s'ouvrir dans un nouvel onglet sécurisé (rel noopener noreferrer) une fois le DOM monté.
function ReadOnlyBody({ bodyJson }: { bodyJson: unknown }) {
  const editor = useEditor({
    extensions: PROPOSAL_EXTENSIONS,
    content: (bodyJson as object | null) ?? undefined,
    editable: false,
    editorProps: {
      attributes: {
        class: "tiptap prose-editor max-w-none text-sm leading-relaxed text-slate-900",
      },
    },
  });

  // Sécurise les liens du contenu client (target _blank + noopener noreferrer) après rendu.
  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;
    root.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    });
  }, [editor, bodyJson]);

  return <EditorContent editor={editor} />;
}
