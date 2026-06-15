// PortalPaymentDto — réponse minimale pour GET /portal/payments (PORT-04).
// SÉCURITÉ (T-4-leak) : JAMAIS orgId/projectId exposés — seuls les champs utiles au contact.
export type PortalPaymentDto = {
  id: string;
  kind: "DEPOSIT" | "BALANCE";
  status: "PENDING" | "PAID" | "FAILED";
  amountCents: number;
  currency: string;
};
