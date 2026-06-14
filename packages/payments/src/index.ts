// @kessel/payments — SEUL point d'export public du domaine paiements (FOUND-05).
// La logique domaine (PaymentService) consomme @kessel/db + @kessel/shared uniquement.
// Les controllers apps/api l'injectent via DI NestJS. @kessel/proposals N'IMPORTE JAMAIS ce package.

export { PaymentService } from "./payment.service";
export type {
  CreateDepositArgs,
  CreateDepositResult,
  CreateDepositPending,
  CreateBalanceArgs,
  CreateBalanceResult,
  PublicPaymentView,
} from "./payment.service";

export {
  STRIPE_CLIENT,
  generatePaymentToken,
  hashPaymentToken,
} from "./stripe.tokens";
export type { StripeLike } from "./stripe.tokens";
