import { z } from "zod";
import type { PricingItemDto } from "@kessel/shared";

// Modèle de l'entité PricingItem côté web (couche `entities`).
//
// Le TYPE vient du contrat partagé @kessel/shared (source de vérité unique — anti-drift front/back).
// `PricingItem` est un alias de `PricingItemDto` (unitPrice: string — Decimal au boundary, Pitfall 2).
// Le SCHÉMA de validation est un miroir zod de `PricingItemInput` (le web utilise zod, jamais
// class-validator). Validation web = UX + défense en profondeur ; la frontière d'autorité reste le
// DTO serveur (T-3-web-input).

export type PricingItem = PricingItemDto;

// unitPrice : l'Input number de rhf renvoie une string ; on coerce en number et exige >= 0 (miroir
// @Min(0) serveur). Champ REQUIS (un tarif a toujours un prix) — pas de preprocess optionnel ici.
// unit : texte libre optionnel ("jour", "heure", "forfait") — vide => undefined (envoyé null serveur).
export const pricingItemFormSchema = z.object({
  name: z.string().trim().min(1, "La prestation est requise"),
  unitPrice: z.coerce
    .number({ message: "Le prix doit être un nombre" })
    .min(0, "Le prix doit être positif"),
  unit: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.string().trim().optional(),
  ),
});

// Le coerce/preprocess rend l'INPUT (ce que les champs rhf produisent : strings) distinct de l'OUTPUT
// (unitPrice number validé). On expose les deux pour typer useForm<Input, ctx, Output>.
export type PricingItemFormInput = z.input<typeof pricingItemFormSchema>;
export type PricingItemFormValues = z.output<typeof pricingItemFormSchema>;
