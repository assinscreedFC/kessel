import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import type { UpdateProposalInput } from "@kessel/shared";

// PATCH partiel (autosave). Tous les champs optionnels, validés quand présents. bodyJson = objet JSON.
export class UpdateProposalDto implements UpdateProposalInput {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsObject()
  bodyJson?: unknown;
}
