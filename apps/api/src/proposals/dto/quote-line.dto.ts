import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";
import type { QuoteLineInput } from "@kessel/shared";

// DTO ligne de devis (snapshot, PROP-03). description non vide bornée ; quantity/unitPrice >= 0 ;
// position entier >= 0. SNAPSHOT : ces valeurs sont copiées telles quelles dans la QuoteLine
// (aucune FK vers PricingItem — le client a déjà résolu le snapshot OU saisi une ligne libre).
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
}

// Réordonnancement : liste ordonnée d'ids de lignes (réécrit les positions côté serveur).
export class ReorderQuoteLinesDto {
  @IsUUID("all", { each: true })
  orderedIds!: string[];
}
