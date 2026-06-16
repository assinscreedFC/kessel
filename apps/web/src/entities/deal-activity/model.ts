import { z } from "zod";
import {
  ACTIVITY_TYPE_VALUES,
  type ActivityType,
  type DealActivityDto,
} from "@kessel/shared";

// Modèle de l'entité DealActivity côté web (couche `entities`).
// Re-exporte les types partagés @kessel/shared + expose le schéma zod de validation
// du formulaire d'ajout d'activité (miroir des contraintes du DTO serveur Plan 03).

export type { DealActivityDto, ActivityType };
export { ACTIVITY_TYPE_VALUES };

// activityFormSchema — validation côté web (miroir CreateActivityDto serveur).
// T-6-17 : content borné à max 5000 caractères (mirror DTO @MaxLength(5000)).
export const activityFormSchema = z.object({
  type: z.enum(ACTIVITY_TYPE_VALUES as [ActivityType, ...ActivityType[]]),
  content: z.string().trim().min(1, "Le contenu est requis").max(5000, "Limité à 5000 caractères"),
});

export type ActivityFormValues = z.output<typeof activityFormSchema>;
export type ActivityFormInput = z.input<typeof activityFormSchema>;
