import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { I18nContext, I18nService } from "nestjs-i18n";
import { checkVAT, countries } from "jsvat-next";
import { forOrg } from "@kessel/db";
import type { UpdateOrgSettingsDto } from "./dto/update-org-settings.dto";

// Champs TVA + locale exposés par GET /api/orgs/me/settings.
export interface OrgSettingsDto {
  vatRegime: string | null;
  vatNumber: string | null;
  country: string | null;
  defaultLocale: string | null;
}

@Injectable()
export class OrgSettingsService {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes -> token DI requis.
  constructor(@Inject(I18nService) private readonly i18n: I18nService) {}

  // Lecture des settings TVA/locale de l'org — accessible à tous les membres (pas owner-only).
  async getOrgSettings(orgId: string): Promise<OrgSettingsDto> {
    const org = await forOrg(orgId).organization.findUnique({
      where: { id: orgId },
      select: { vatRegime: true, vatNumber: true, country: true, defaultLocale: true },
    });
    return {
      vatRegime: (org as OrgSettingsDto | null)?.vatRegime ?? null,
      vatNumber: (org as OrgSettingsDto | null)?.vatNumber ?? null,
      country: (org as OrgSettingsDto | null)?.country ?? null,
      defaultLocale: (org as OrgSettingsDto | null)?.defaultLocale ?? null,
    };
  }

  // Mise à jour des settings TVA/locale de l'org (owner-only — RBAC au contrôleur).
  // Valide le format du n° TVA via jsvat-next si fourni (T-7-04 : validation serveur obligatoire).
  async updateOrgSettings(orgId: string, dto: UpdateOrgSettingsDto): Promise<OrgSettingsDto> {
    if (dto.vatNumber !== undefined && dto.vatNumber !== "") {
      const valid = checkVAT(dto.vatNumber, countries).isValidFormat;
      if (!valid) {
        const msg = this.i18n.translate("common.errors.vat_number_invalid", {
          lang: I18nContext.current()?.lang ?? "fr",
        });
        throw new BadRequestException(msg);
      }
    }

    // Ne mettre à jour que les champs explicitement fournis dans le DTO (mise à jour partielle).
    const data: Record<string, unknown> = {};
    if (dto.vatRegime !== undefined) data["vatRegime"] = dto.vatRegime;
    if (dto.vatNumber !== undefined) data["vatNumber"] = dto.vatNumber;
    if (dto.country !== undefined) data["country"] = dto.country;
    if (dto.defaultLocale !== undefined) data["defaultLocale"] = dto.defaultLocale;

    await forOrg(orgId).organization.update({
      where: { id: orgId },
      data: data as never,
    });

    return this.getOrgSettings(orgId);
  }
}
