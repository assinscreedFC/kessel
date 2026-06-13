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
}
