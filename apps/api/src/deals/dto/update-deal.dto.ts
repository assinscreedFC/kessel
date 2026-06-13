import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import { DealStatus } from "@kessel/shared";

// PATCH partiel : tous les champs optionnels. Validés (enum/UUID/min) quand présents.
export class UpdateDealDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsEnum(DealStatus)
  status?: DealStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;

  // reason : raison de perte (Phase 6, AI-01) — optionnelle, DTO-only. NE persiste PAS sur Deal :
  // alimente uniquement le ProposalOutcome(LOST) quand status passe à LOST (orchestration apps/api).
  // Whitelist ValidationPipe : le champ doit être déclaré ici pour ne pas être strippé.
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
