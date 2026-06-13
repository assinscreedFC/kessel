import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

// DTO de signature publique (DELIV-03) — défini ICI (frontière du module public) mais consommé par
// le Plan 05-03 (POST /api/public/proposals/:token/sign). Validé par le ValidationPipe global
// (V5 Input Validation) : nom non vide borné, email valide, consentement explicite requis (=== true).
//
// `consent` @Equals(true) : la signature légale exige un consentement actif du signataire — un
// `false`/absent est rejeté (400). Pas de tracé manuscrit en v0 (RESEARCH : différé polish).
export class SignProposalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  signerName!: string;

  @IsEmail()
  signerEmail!: string;

  @IsBoolean()
  @Equals(true)
  consent!: boolean;
}
