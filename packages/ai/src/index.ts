// @kessel/ai — point d'export public du domaine ai (moteur de propositions IA, Phase 4).
//
// Cœur PUR et testable : l'interface ProposalGenerator (frontière à faker) + son token DI, le fake
// déterministe, l'assemblage de prompt (buildPrompt), l'assemblage ProseMirror (sectionsToProseMirror),
// l'extracteur de texte (proseMirrorToText), le schéma d'outil Anthropic et l'impl Anthropic.

export * from "./proposal-generator";
export * from "./fake-proposal-generator";
export * from "./prompt";
export * from "./body-doc";
export * from "./body-text";
export * from "./proposal-tool-schema";
export * from "./anthropic-proposal-generator";
export * from "./ai-proposal.service";
