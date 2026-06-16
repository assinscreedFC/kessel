import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { QuoteLineInput } from "@kessel/shared";

// DTO ligne de devis (snapshot, PROP-03). description non vide bornée ; quantity/unitPrice >= 0 ;
// position entier >= 0. SNAPSHOT : ces valeurs sont copiées telles quelles dans la QuoteLine
// (aucune FK vers PricingItem — le client a déjà résolu le snapshot OU saisi une ligne libre).
// vatRate borné [0,1] — ex. 0.20 pour 20% (T-7-10 input validation).
export class QuoteLineDto implements QuoteLineInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsInt()
  @Min(0)
  position!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vatRate?: number;
}

// PATCH partiel d'une ligne : tous les champs optionnels, validés quand présents.
export class UpdateQuoteLineDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  vatRate?: number;
}

// Réordonnancement : liste ordonnée d'ids de lignes (réécrit les positions côté serveur).
export class ReorderQuoteLinesDto {
  @IsUUID("all", { each: true })
  orderedIds!: string[];
}
