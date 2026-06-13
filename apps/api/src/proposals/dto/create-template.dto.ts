import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from "class-validator";
import type { ProposalTemplateInput } from "@kessel/shared";

// DTO template de proposition (PROP-02). name non vide borné ; bodyJson = objet JSON (ProseMirror).
export class CreateTemplateDto implements ProposalTemplateInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsObject()
  bodyJson!: unknown;
}

// PATCH partiel d'un template.
export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsObject()
  bodyJson?: unknown;
}
