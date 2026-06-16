import { IsEnum, IsInt, Min } from "class-validator";
import { DealStatus, type MoveDealInput } from "@kessel/shared";

// DTO de validation pour PATCH /api/deals/:id/move { status, position }.
// Implémente MoveDealInput (contrat @kessel/shared) avec class-validator.
// T-6-09 : @IsEnum(DealStatus) + @IsInt @Min(0) — rejette status hors enum et position négative.
export class MoveDealDto implements MoveDealInput {
  @IsEnum(DealStatus)
  status!: DealStatus;

  @IsInt()
  @Min(0)
  position!: number;
}
