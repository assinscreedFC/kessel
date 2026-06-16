import { IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

// PaginationDto (API-02) — query params ?page=&limit= pour les listes /api/v1/*.
//
// Contraintes :
//   - page >= 1 (défaut 1)
//   - limit >= 1 (défaut 20)
//   - limit <= 100 (@Max(100)) — limit=500 → 400 rejeté par le ValidationPipe global.
//
// T-5-v1-input : class-validator rejette les valeurs hors bornes → 400 (pas de clamp silencieux).
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
