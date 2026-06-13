import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import type { PricingItemInput } from "@kessel/shared";

// DTO élément de grille de tarifs (PROP-03, T-3-input). name non vide borné ; unitPrice >= 0 ;
// unit texte libre nullable borné. `implements PricingItemInput`.
export class PricingItemDto implements PricingItemInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string | null;
}

// PATCH partiel d'un élément de grille.
export class UpdatePricingItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string | null;
}
