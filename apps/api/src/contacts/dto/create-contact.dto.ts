import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import type { ContactInput } from "@kessel/shared";

// DTO boundary serveur (V5 Input Validation / T-2-input) — dérive du contrat @kessel/shared ContactInput.
// Validé par le ValidationPipe global (whitelist+transform). `implements ContactInput` garantit
// l'alignement champ-à-champ avec le contrat partagé (anti-drift front/back).
export class CreateContactDto implements ContactInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizationName?: string | null;
}
