import { IsNotEmpty, IsObject, IsString, IsUUID, MaxLength } from "class-validator";
import type { CreateProposalInput } from "@kessel/shared";

// DTO boundary serveur (T-3-input). dealId = UUID valide ; title non vide borné ; bodyJson = OBJET JSON
// (document ProseMirror/Tiptap) — V5 : on valide que c'est un objet (jamais exécuté), pas un scalaire/array.
// `implements CreateProposalInput` aligne sur le contrat @kessel/shared (anti-drift front/back).
export class CreateProposalDto implements CreateProposalInput {
  @IsUUID()
  dealId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsObject()
  bodyJson!: unknown;
}
