// Modèle de l'entité WebhookDelivery côté web (couche `entities`).
//
// WebhookDeliveryDto : shape retournée par GET /api/settings/webhooks/deliveries.
// DELIVERY_STATUS_META : lookup badge par statut (PENDING / DELIVERED / FAILED).

export interface WebhookDeliveryDto {
  id: string;
  event: string;
  webhookEndpointId: string;
  status: "PENDING" | "DELIVERED" | "FAILED";
  responseCode: number | null;
  attemptCount: number;
  deliveredAt: string | null;
  createdAt: string;
}

export type DeliveryStatus = WebhookDeliveryDto["status"];

export interface DeliveryStatusMeta {
  label: string;
  className: string;
}

export const DELIVERY_STATUS_META: Record<DeliveryStatus, DeliveryStatusMeta> = {
  PENDING: {
    label: "En attente",
    className: "bg-yellow-100 text-yellow-700",
  },
  DELIVERED: {
    label: "Livré",
    className: "bg-green-100 text-green-700",
  },
  FAILED: {
    label: "Échec",
    className: "bg-red-100 text-red-700",
  },
};
