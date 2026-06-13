import Anthropic from "@anthropic-ai/sdk";
import type {
  GenerateProposalInput,
  GeneratedProposal,
  ProposalGenerator,
} from "./proposal-generator";
import { buildPrompt } from "./prompt";
import { GENERATE_TOOL, GENERATE_TOOL_NAME } from "./proposal-tool-schema";

// anthropic-proposal-generator.ts — la SEULE classe qui touche le réseau (l'impl prod de la frontière).
//
// Dégradation gracieuse (Pitfall 2 / T-4-degrade) : si ANTHROPIC_API_KEY est absente, on NE crée PAS
// le client au boot (pas de crash). C'est l'appel `generate()` qui lève `AiUnavailableError` -> le
// controller le mappe en 503. Le reste de l'API (CRM, propositions manuelles) fonctionne sans clé.
//
// Non-fuite (Pitfall 3 / T-4-leak) : on ne logue JAMAIS le brief, la clé, ni le payload de réponse —
// seules des métadonnées (model, status) sont émises.

const DEFAULT_MODEL = "claude-sonnet-4-6"; // défaut courant (pas un ID Opus legacy -> 404) ; surchargeable env.
const MAX_TOKENS = 4096;

// Erreur typée signalant que la génération IA est indisponible (clé manquante / appel impossible).
export class AiUnavailableError extends Error {
  constructor(message = "Génération IA indisponible : ANTHROPIC_API_KEY non configurée.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export class AnthropicProposalGenerator implements ProposalGenerator {
  // Client créé paresseusement : null tant que la clé est absente (jamais d'instanciation au boot).
  private client: Anthropic | null = null;

  // Indique si la génération IA est disponible (clé présente). Le controller peut l'exposer en feature-flag.
  isAvailable(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  private getClient(): Anthropic {
    if (!this.isAvailable()) throw new AiUnavailableError();
    if (!this.client) this.client = new Anthropic(); // lit ANTHROPIC_API_KEY de l'env
    return this.client;
  }

  async generate(input: GenerateProposalInput): Promise<GeneratedProposal> {
    const client = this.getClient();
    const model = process.env.KESSEL_AI_MODEL ?? DEFAULT_MODEL;
    const { system, messages } = buildPrompt(input);

    const message = await client.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages,
      tools: [GENERATE_TOOL],
      tool_choice: { type: "tool", name: GENERATE_TOOL_NAME }, // force l'outil -> pas de texte libre
    });

    // Le SDK a déjà parsé .input. Ne jamais loguer `message` (peut contenir un écho du brief).
    const block = message.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      throw new Error("Réponse IA sans bloc tool_use exploitable.");
    }
    return block.input as GeneratedProposal;
  }
}
