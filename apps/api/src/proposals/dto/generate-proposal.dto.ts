import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";
import type { GenerateProposalRequest } from "@kessel/shared";

// DTO boundary serveur pour la génération IA (T-4-input / T-4-dos).
// `implements GenerateProposalRequest` aligne sur le contrat @kessel/shared (anti-drift front/back).
//
// - brief : texte libre collé par l'utilisateur. Borné à 20000 caractères (@MaxLength) — anti-DoS
//   (T-4-dos), en plus de la troncature BRIEF_MAX_CHARS côté prompt (Plan 01). Donnée confidentielle :
//   jamais loggée côté serveur.
// - dealId : UUID du deal auquel rattacher la proposition générée (IDOR validé forOrg en aval).
// - templateId : optionnel (UUID si présent).
const BRIEF_MAX = 20_000;

export class GenerateProposalDto implements GenerateProposalRequest {
  @IsUUID()
  dealId!: string;

  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(BRIEF_MAX)
  brief!: string;
}
