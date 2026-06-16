import { z } from "zod";
import type { ContactDto } from "@kessel/shared";

// Modèle de l'entité Contact côté web (couche `entities`).
//
// Le TYPE vient du contrat partagé @kessel/shared (source de vérité unique — pas de re-déclaration,
// anti-drift front/back). Le SCHÉMA de validation est un miroir zod de `ContactInput` (le web utilise
// zod, jamais class-validator qui est runtime Node). La validation web = UX + défense en profondeur ;
// la frontière d'autorité reste le DTO serveur (T-2-input).

export type Contact = ContactDto;

export const contactFormSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis"),
  email: z.string().trim().email("Email invalide"),
  organizationName: z.string().trim().optional(),
  // CRM-06 : rattachement optionnel à une organisation cliente (null = détacher)
  clientOrgId: z.string().uuid().nullable().optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
