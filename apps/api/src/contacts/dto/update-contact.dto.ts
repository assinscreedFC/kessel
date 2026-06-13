import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

// PATCH partiel : tous les champs optionnels. Quand présents, ils sont validés comme à la création.
export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  organizationName?: string | null;
}
