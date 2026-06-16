import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { ACTIVITY_TYPE_VALUES, type ActivityType, type DealActivityInput } from "@kessel/shared";

// DTO de validation pour POST /api/deals/:id/activities { type, content }.
// Implémente DealActivityInput (contrat @kessel/shared) avec class-validator.
// ActivityType est un objet const (pas un vrai enum TS) — @IsIn(ACTIVITY_TYPE_VALUES) est plus sûr
// que @IsEnum(ActivityType) pour les objets const (T-6-09).
// T-6-09 : @IsIn(ACTIVITY_TYPE_VALUES) + @MaxLength(5000) — rejette type invalide et contenu trop long.
export class CreateActivityDto implements DealActivityInput {
  @IsIn(ACTIVITY_TYPE_VALUES)
  type!: ActivityType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
