import { z } from "zod";
import type { ClientOrgDto } from "@kessel/shared";

// Modèle de l'entité ClientOrg côté web (couche `entities`).
//
// Le TYPE vient du contrat partagé @kessel/shared (source de vérité unique — anti-drift front/back).
// Le SCHÉMA de validation est un miroir zod de `ClientOrgInput` (T-6-18 : validation UI en profondeur,
// autorité reste le DTO serveur). max(100) miroir @MaxLength(100) serveur.

export type ClientOrg = ClientOrgDto;

export const clientOrgFormSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(100, "Le nom ne doit pas dépasser 100 caractères"),
});

export type ClientOrgFormValues = z.infer<typeof clientOrgFormSchema>;
