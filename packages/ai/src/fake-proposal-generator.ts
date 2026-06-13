import type {
  GenerateProposalInput,
  GeneratedProposal,
  ProposalGenerator,
} from "./proposal-generator";

// FakeProposalGenerator — fixture déterministe de la frontière LLM (utilisée en e2e Plan 02).
//
// PARAMÉTRABLE PAR L'HISTORIQUE : sa sortie DÉPEND de `input.wonExamples.length`. C'est ce qui
// prouve la calibration bout-en-bout (AI-02) sans appeler Claude — une org AVEC historique gagné
// reçoit une proposition marquée « calibrée », une org SANS historique reçoit la version de base.
// La sortie par défaut est toujours valide : ≥1 bodySection, ≥1 quoteLine avec quantity/unitPrice
// NUMÉRIQUES (jamais de strings — elles alimentent QuoteLineInput numérique tel quel en 04-02).
export class FakeProposalGenerator implements ProposalGenerator {
  // Sortie fixe optionnelle : si fournie, elle est renvoyée telle quelle (override total).
  constructor(private readonly fixedOutput?: GeneratedProposal) {}

  async generate(input: GenerateProposalInput): Promise<GeneratedProposal> {
    if (this.fixedOutput) return this.fixedOutput;

    const calibrated = input.wonExamples.length > 0;
    const heading = calibrated
      ? "Périmètre (calibré sur l'historique gagné)"
      : "Périmètre";
    const effortNotes = calibrated
      ? `Estimation calibrée sur ${input.wonExamples.length} proposition(s) gagnée(s).`
      : "Estimation standard (aucun historique gagné disponible).";

    // Si la grille existe, on reprend le premier tarif comme ligne pour rester cohérent (PROP-05).
    const firstPricing = input.pricing[0];
    const unitPrice = firstPricing ? Number(firstPricing.unitPrice) : 1000;
    const description = firstPricing ? firstPricing.name : "Prestation de conseil";

    return {
      scope: calibrated
        ? "Proposition générée (calibrée flywheel)"
        : "Proposition générée",
      deliverables: ["Livrable A", "Livrable B"],
      effortNotes,
      bodySections: [
        {
          heading,
          paragraphs: ["Corps de proposition généré déterministe (fake)."],
          bullets: ["Point clé 1", "Point clé 2"],
        },
      ],
      quoteLines: [
        { description, quantity: 1, unitPrice },
      ],
    };
  }
}
