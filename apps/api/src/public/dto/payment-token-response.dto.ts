// DTO de réponse GET /api/public/payments/:token (PAY-02).
// Expose uniquement les champs nécessaires à la page de paiement publique.
// T-3-card : client_secret transmis une seule fois via HTTPS, jamais loggé.

export class PaymentTokenResponseDto {
  clientSecret!: string;
  kind!: string;
  amountCents!: number;
  currency!: string;
  orgName!: string;
}
