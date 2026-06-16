import { z } from "zod";
import { DEAL_STATUS_VALUES, type DealDto, type DealStatus } from "@kessel/shared";

// Modèle de l'entité Deal côté web (couche `entities`).
//
// Le TYPE vient du contrat partagé @kessel/shared (source de vérité unique — anti-drift front/back).
// `Deal` est un alias de `DealDto` (amount: string | null — Pitfall 2). Le SCHÉMA de validation est un
// miroir zod de `DealInput` (le web utilise zod, jamais class-validator). Validation web = UX + défense
// en profondeur ; la frontière d'autorité reste le DTO serveur (T-2-input).

export type Deal = DealDto;
export { DEAL_STATUS_VALUES, type DealStatus };

// amount : Input number renvoie une string ; vide ("" / undefined) = absent (optionnel). On préprocesse
// pour ne coercer en number QUE si une valeur est saisie — sinon `z.coerce.number().optional()` transforme
// undefined en NaN et casse le cas "sans montant". Une valeur saisie est validée >= 0 (miroir @Min(0)).
const optionalAmount = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().min(0, "Le montant doit être positif").optional(),
);

export const dealFormSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis"),
  contactId: z.string().uuid("Sélectionnez un contact"),
  status: z.enum(DEAL_STATUS_VALUES as [DealStatus, ...DealStatus[]]),
  amount: optionalAmount,
  // CRM-06 : rattachement optionnel à une organisation cliente (null = aucune)
  clientOrgId: z.string().uuid().nullable().optional(),
});

// Le preprocess d'amount rend l'INPUT (ce que les champs rhf produisent, ex. string de l'Input number)
// distinct de l'OUTPUT (number validé). On expose les deux pour typer useForm<Input, ctx, Output>.
export type DealFormInput = z.input<typeof dealFormSchema>;
export type DealFormValues = z.output<typeof dealFormSchema>;

// "Marquer comme perdu" (Phase 6, AI-01 critère 3) : raison OPTIONNELLE, bornée à 2000 caractères en
// miroir du DTO serveur (UpdateDealDto.reason @MaxLength 2000, Plan 06-02). Une raison vide est absente
// (undefined) — la discrétion est respectée, l'outcome LOST est enregistré avec reason null côté serveur.
export const markLostFormSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(2000, "La raison ne doit pas dépasser 2000 caractères")
    .optional(),
});

export type MarkLostFormValues = z.output<typeof markLostFormSchema>;
