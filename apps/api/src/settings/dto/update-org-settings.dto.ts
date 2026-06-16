import { IsEnum, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";
import { i18nValidationMessage } from "nestjs-i18n";

// DTO PATCH /api/orgs/me/settings — tous les champs sont optionnels (mise à jour partielle).
// La validation de FORMAT du n° TVA (jsvat-next) est dans OrgSettingsService, pas ici.
// Messages de validation localisés via i18nValidationMessage (I18N-03).
export class UpdateOrgSettingsDto {
  @IsOptional()
  @IsEnum(["FRANCHISE", "NORMAL", "INTRACOM"], {
    message: i18nValidationMessage("common.validation.IS_ENUM"),
  })
  vatRegime?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage("common.validation.IS_STRING") })
  vatNumber?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage("common.validation.IS_STRING") })
  @MaxLength(2, { message: i18nValidationMessage("common.validation.MAX_LENGTH") })
  country?: string;

  @IsOptional()
  @IsEnum(["fr", "en"], {
    message: i18nValidationMessage("common.validation.IS_ENUM"),
  })
  defaultLocale?: string;

  @IsOptional()
  @IsUrl({}, { message: i18nValidationMessage("common.validation.IS_URL") })
  logo?: string;

  @IsOptional()
  @IsString({ message: i18nValidationMessage("common.validation.IS_STRING") })
  brandColor?: string;
}
