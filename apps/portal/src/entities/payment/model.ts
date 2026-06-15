// PAYMENT_STATUS_META — SOURCE UNIQUE du mapping statut -> (label FR + classes badge), 04-UI-SPEC
// §Color. Copié verbatim depuis apps/web/src/entities/payment/model.ts.
// Palette : yellow (en attente), green (payé), red (échoué).
export const PAYMENT_STATUS_META: Record<
  "PENDING" | "PAID" | "FAILED",
  { label: string; badge: string }
> = {
  PENDING: { label: "En attente", badge: "bg-yellow-100 text-yellow-700" },
  PAID: { label: "Payé", badge: "bg-green-100 text-green-700" },
  FAILED: { label: "Échoué", badge: "bg-red-100 text-red-700" },
};

/** Représentation d'un paiement côté portail client. */
export type Payment = {
  id: string;
  kind: "DEPOSIT" | "BALANCE";
  status: "PENDING" | "PAID" | "FAILED";
  amountCents: number;
  currency: string;
};
