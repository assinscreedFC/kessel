import { IsString, Length } from "class-validator";

// DTO de création de clé API (API-01) — validation à la frontière HTTP.
// Seul `name` est requis (chaîne non vide, max 100 chars).
export class CreateApiKeyDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}
