import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from "class-validator";

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

  // CRM-06 : rattachement à une ClientOrg ; null = détacher. UUID validé uniquement quand non null.
  @IsOptional()
  @ValidateIf((o: UpdateContactDto) => o.clientOrgId !== null)
  @IsUUID()
  clientOrgId?: string | null;
}
