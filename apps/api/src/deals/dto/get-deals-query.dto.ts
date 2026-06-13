import { IsEnum, IsOptional } from "class-validator";
import { DealStatus } from "@kessel/shared";

// Query du filtre statut (CRM-03). status optionnel (absent = "Tous"), borné à l'enum partagé.
// Le ValidationPipe (transform) instancie ce DTO depuis la query string -> @IsEnum s'applique.
export class GetDealsQueryDto {
  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;
}
