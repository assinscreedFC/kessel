import { loadStripe } from "@stripe/stripe-js";

// Singleton Stripe.js — chargé UNE SEULE FOIS au démarrage du module (pattern officiel Stripe).
// La clé est UNIQUEMENT la publishable key (pk_test_... / pk_live_...) — jamais la secret key.
// Guard : si la variable d'environnement est absente au build, on lève une erreur claire immédiatement
// pour éviter un échec silencieux lors du premier paiement (Pitfall 6 — 03-RESEARCH).
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

if (!publishableKey) {
  throw new Error(
    "[Kessel] VITE_STRIPE_PUBLISHABLE_KEY manquant. Définissez-le dans apps/web/.env avant de lancer le serveur de développement.",
  );
}

export const stripePromise = loadStripe(publishableKey);
