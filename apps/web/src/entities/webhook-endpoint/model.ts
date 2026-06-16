import { z } from "zod";

// Modèle de l'entité WebhookEndpoint côté web (couche `entities`).
//
// WebhookEndpointDto : shape retournée par GET /api/settings/webhooks (sans secret).
// addEndpointSchema : validation Zod (url + ≥1 événement) — miroir de CreateWebhookEndpointDto côté serveur.
// WEBHOOK_EVENT_OPTIONS : options pour les checkboxes événements (4 types supportés).

export interface WebhookEndpointDto {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
}

export const WEBHOOK_EVENT_OPTIONS = [
  { value: "deal.created", label: "Deal créé" },
  { value: "proposal.signed", label: "Proposition signée" },
  { value: "project.created", label: "Projet créé" },
  { value: "payment.received", label: "Paiement reçu" },
] as const;

export type WebhookEventValue = (typeof WEBHOOK_EVENT_OPTIONS)[number]["value"];

const ALLOWED_EVENTS = WEBHOOK_EVENT_OPTIONS.map((e) => e.value) as [string, ...string[]];

export const addEndpointSchema = z.object({
  url: z.string().url("URL invalide"),
  events: z.array(z.enum(ALLOWED_EVENTS as [WebhookEventValue, ...WebhookEventValue[]])).min(1, "Sélectionnez au moins un événement"),
});

export type AddEndpointFormValues = z.output<typeof addEndpointSchema>;
