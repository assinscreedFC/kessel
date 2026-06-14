import { useQuery } from "@tanstack/react-query";
import { publicApi } from "@/shared/api/public-client";

// Couche data de la surface PUBLIQUE /pay/:token. Tous les appels passent par `publicApi` (fetch SANS
// credentials — jamais de cookie dashboard, garde-fou isolation T-3-web-iso). Mirror de public-proposal/api.ts.

// DTO public renvoyé par GET /api/public/payments/:token (miroir du PaymentTokenResponseDto serveur, Plan 03-03).
// client_secret : re-fetché depuis Stripe, jamais persisté (T-3-card SAQ A).
export interface PublicPayment {
  clientSecret: string;
  kind: "DEPOSIT" | "BALANCE";
  amountCents: number;
  currency: string;
  orgName: string;
}

// Lecture du paiement public par token. 404 (token inconnu/révoqué/expiré) -> remonte PublicApiError
// telle quelle (la page traduit en état expired, copie neutre, anti-énumération T-3-enum).
// `retry: false` pour ne pas marteler un endpoint rate-limité sur un 404 légitime.
export function usePublicPayment(token: string) {
  return useQuery<PublicPayment>({
    queryKey: ["public-payment", token],
    queryFn: () => publicApi.get<PublicPayment>(`/public/payments/${token}`),
    enabled: Boolean(token),
    retry: false,
  });
}
