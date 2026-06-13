import { IsNotEmpty, IsString, IsUUID, MaxLength } from "class-validator";
import type { CreateFromTemplateInput } from "@kessel/shared";

// DTO create-from-template (PROP-02 + T-3-idor). templateId ET dealId = UUID valides (vérifiés
// appartenir à l'org côté service). Le client n'envoie JAMAIS le bodyJson : le serveur copie celui
// du template (anti-tampering). `implements CreateFromTemplateInput`.
export class CreateFromTemplateDto implements CreateFromTemplateInput {
  @IsUUID()
  templateId!: string;

  @IsUUID()
  dealId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
