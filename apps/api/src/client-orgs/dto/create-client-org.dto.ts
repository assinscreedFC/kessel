import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import type { ClientOrgInput } from "@kessel/shared";

// DTO boundary serveur (T-6-06 : input validation) — dérive du contrat @kessel/shared ClientOrgInput.
// Validé par le ValidationPipe global (whitelist+transform). `implements ClientOrgInput` garantit
// l'alignement champ-à-champ avec le contrat partagé (anti-drift front/back).
export class CreateClientOrgDto implements ClientOrgInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
