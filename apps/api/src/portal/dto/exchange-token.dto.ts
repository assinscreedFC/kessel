import { IsNotEmpty, IsString, Length } from "class-validator";

// DTO validé class-validator (V5 Input Validation).
// Validation à la frontière HTTP : token brut soumis par le client portail.
export class ExchangeTokenDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 100)
  token!: string;
}
