import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Singleton Stripe.js PARESSEUX — résolu à la PREMIÈRE utilisation (page de paiement), jamais au
// module-eval. La clé est UNIQUEMENT la publishable key (pk_test_... / pk_live_...) — jamais la secret.
//
// Pourquoi paresseux (et pas un throw au niveau module) : app.tsx importe transitivement ce module
// (via la page de paiement publique). Un `throw` au chargement du module casserait TOUT le bundle —
// page blanche sur CHAQUE route (login, contacts, …) si la clé manque, sans erreur visible (Vite
// avale l'erreur dans le graphe dynamique). Le guard ne doit échouer QUE quand Stripe est réellement
// utilisé. Voir 03-RESEARCH Pitfall 6 (fail loud) — corrigé pour ne fail loud que sur la page paiement.
let cached: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (cached) return cached;

  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
  if (!publishableKey) {
    throw new Error(
      "[Kessel] VITE_STRIPE_PUBLISHABLE_KEY manquant. Définissez-le dans apps/web/.env avant de prendre un paiement.",
    );
  }

  cached = loadStripe(publishableKey);
  return cached;
}
