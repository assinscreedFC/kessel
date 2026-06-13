// proposal-generator.ts — la FRONTIÈRE à faker (l'appel LLM, I/O externe non déterministe).
//
// L'appel Claude réel est isolé derrière cette interface : en prod on bind l'impl Anthropic,
// en test on bind un fake déterministe (`FakeProposalGenerator`). C'est la SEULE I/O fakée —
// la DB reste réelle (Testcontainers, règle projet) car le LLM n'est pas une I/O locale reproductible.
//
// Token DI Symbol OBLIGATOIRE : une interface TS n'a pas de token runtime, et SWC/esbuild n'émet
// pas `design:paramtypes` pour les interfaces (cf. 02-02 Deviation #1). On injecte via
// `@Inject(PROPOSAL_GENERATOR)`.

// === Entrées de génération ===
export interface GenerateProposalPricingItem {
  name: string;
  unitPrice: string; // string au boundary (Decimal->string, précision monétaire)
  unit?: string | null;
}

export interface GenerateProposalWonLine {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface GenerateProposalWonExample {
  bodyText: string; // texte extrait du bodyJson ProseMirror gagné (via proseMirrorToText)
  lines: GenerateProposalWonLine[];
}

export interface GenerateProposalInput {
  brief: string;
  pricing: GenerateProposalPricingItem[];
  wonExamples: GenerateProposalWonExample[];
}

// === Sortie de génération ===
// quoteLines.quantity / unitPrice sont NUMÉRIQUES : ils alimentent QuoteLineInput[] (numérique)
// tel quel en 04-02, SANS String() (le service Phase 3 attend des numbers en entrée).
export interface GeneratedQuoteLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface GeneratedBodySection {
  heading: string;
  paragraphs: string[];
  bullets: string[];
}

export interface GeneratedProposal {
  scope: string;
  deliverables: string[];
  effortNotes: string;
  bodySections: GeneratedBodySection[];
  quoteLines: GeneratedQuoteLine[];
}

export interface ProposalGenerator {
  generate(input: GenerateProposalInput): Promise<GeneratedProposal>;
}

// Token DI (Symbol) — voir le commentaire d'en-tête : obligatoire, pas optionnel.
export const PROPOSAL_GENERATOR = Symbol("PROPOSAL_GENERATOR");
