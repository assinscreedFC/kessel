// Stripe provider factory — lie STRIPE_CLIENT à l'instance Stripe réelle en production.
// En test e2e, le provider est remplacé via overrideProvider(STRIPE_CLIENT) par un stub
// (pas d'appel réseau, pas de clé réelle nécessaire en CI).
//
// T-3-card : STRIPE_SECRET_KEY lu depuis process.env uniquement (jamais hardcodé).
// Le client_secret retourné par Stripe N'EST JAMAIS loggé (voir payment.service.ts).
import Stripe from "stripe";
import { STRIPE_CLIENT } from "./stripe.tokens";

/**
 * Provider NestJS qui instancie le client Stripe avec la clé secrète lue depuis l'env.
 * Enregistrer dans AppModule.providers[] à côté de PaymentService.
 */
export const stripeProvider = {
  provide: STRIPE_CLIENT,
  useFactory: (): Stripe => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is required but not set");
    }
    return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
  },
};
