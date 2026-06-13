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
import { DealStatus, type DealInput } from "@kessel/shared";

// DTO boundary serveur (T-2-input). status borné à l'enum partagé, contactId = UUID valide,
// amount >= 0 (jamais négatif). `implements DealInput` aligne sur le contrat @kessel/shared.
export class CreateDealDto implements DealInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsUUID()
  contactId!: string;

  @IsEnum(DealStatus)
  status!: DealStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;
}
