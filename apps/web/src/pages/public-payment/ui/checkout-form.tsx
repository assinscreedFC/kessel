import { useId, useRef, useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";

// CheckoutForm — formulaire de paiement embarqué (Stripe Payment Element).
// Monté DANS <Elements> — useStripe() et useElements() sont disponibles.
//
// Branche CARD (pi_…) : comportement Phase 3 inchangé — confirmPayment + état succeeded.
// Branche SEPA (seti_…) : mandat explicite + délai 6J + confirmSetup + état pending (PAY-06).
//
// Détection : clientSecret.startsWith('seti_') → SEPA ; sinon card.
// T-3-card : setupClientSecret / clientSecret JAMAIS loggé.
// T-8-sepa : mandat accepté explicitement (checkbox AVANT confirmSetup) ; délai légal affiché AVANT confirm.

interface CheckoutFormProps {
  clientSecret: string;
  amountCents: number;
  currency: string;
  orgName: string;
  onSucceeded: () => void;
  onPending?: () => void;
  onProcessing: (processing: boolean) => void;
}

type SepaState = "ready_sepa" | "ready_sepa_accepted" | "processing" | "pending" | "failed";

export function CheckoutForm({
  clientSecret,
  amountCents,
  currency,
  orgName,
  onSucceeded,
  onPending,
  onProcessing,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // SEPA-specific state
  const isSepa = clientSecret.startsWith("seti_");
  const [mandateAccepted, setMandateAccepted] = useState(false);
  const [sepaState, setSepaState] = useState<SepaState>("ready_sepa");
  const legalTextId = useId();

  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amountCents / 100);

  // --- CARD branch (unchanged from Phase 3) ---
  async function handleCardSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || isProcessing) return;

    setIsProcessing(true);
    onProcessing(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (error) {
      const msg =
        error.type === "card_error" || error.type === "validation_error"
          ? (error.message ?? "Le paiement a échoué. Vérifiez vos informations de carte et réessayez.")
          : "Le paiement a échoué. Vérifiez vos informations de carte et réessayez.";
      setErrorMessage(msg);
      setIsProcessing(false);
      onProcessing(false);
      setTimeout(() => errorRef.current?.focus(), 50);
    } else if (paymentIntent?.status === "succeeded") {
      setIsProcessing(false);
      onProcessing(false);
      onSucceeded();
    } else {
      setIsProcessing(false);
      onProcessing(false);
      setErrorMessage("Le paiement est en cours de traitement. Veuillez patienter.");
    }
  }

  // --- SEPA branch ---
  async function handleSepaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || isProcessing || !mandateAccepted) return;

    setIsProcessing(true);
    setSepaState("processing");
    onProcessing(true);
    setErrorMessage(null);

    // T-3-card : setupClientSecret jamais loggé.
    const { setupIntent, error } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: "if_required",
    });

    if (error) {
      const msg =
        error.type === "validation_error"
          ? (error.message ?? "Le prélèvement SEPA a échoué. Vérifiez vos coordonnées bancaires et réessayez.")
          : "Le prélèvement SEPA a échoué. Vérifiez vos coordonnées bancaires et réessayez.";
      setErrorMessage(msg);
      setIsProcessing(false);
      setSepaState("failed");
      onProcessing(false);
      setTimeout(() => errorRef.current?.focus(), 50);
    } else if (setupIntent?.status === "succeeded") {
      // Mandat enregistré — état PENDING (débit asynchrone sous 6 jours ouvrés)
      setIsProcessing(false);
      setSepaState("pending");
      onProcessing(false);
      onPending?.();
    } else {
      // Statut inattendu (redirect géré par 'if_required')
      setIsProcessing(false);
      setSepaState("pending");
      onProcessing(false);
      onPending?.();
    }
  }

  // --- SEPA pending state ---
  if (isSepa && sepaState === "pending") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded px-2.5 py-0.5 text-xs font-semibold bg-yellow-100 text-yellow-800">
            En cours
          </span>
          <p className="text-base font-semibold text-slate-900">Prélèvement en cours</p>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          Votre mandat SEPA a été enregistré. Le prélèvement sera effectué sous 6 jours ouvrés.
          Vous recevrez une confirmation par email une fois le débit confirmé.
        </p>
      </div>
    );
  }

  // --- SEPA form ---
  if (isSepa) {
    return (
      <form onSubmit={handleSepaSubmit} noValidate>
        <PaymentElement />

        {/* Délai légal — affiché AVANT la confirmation (T-8-sepa) */}
        <div className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-700">
            Le prélèvement sera effectué sous 6 jours ouvrés.
          </p>
          <p className="text-xs text-amber-600">
            Vous recevrez une confirmation par email.
          </p>
        </div>

        {/* Bloc mandat — checkbox + texte légal */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <Checkbox
              id="sepa-mandate"
              checked={mandateAccepted}
              onCheckedChange={(checked: boolean) => {
                setMandateAccepted(checked);
                setSepaState(checked ? "ready_sepa_accepted" : "ready_sepa");
              }}
              aria-describedby={legalTextId}
              className="mt-0.5 shrink-0"
            />
            <Label htmlFor="sepa-mandate" className="cursor-pointer text-sm text-slate-900 leading-snug">
              J&apos;autorise {orgName} à débiter mon compte bancaire pour un montant de {formattedAmount}.
            </Label>
          </div>

          <p id={legalTextId} className="text-xs text-slate-600 leading-relaxed pl-7">
            En fournissant vos informations de paiement et en confirmant ce paiement, vous autorisez{" "}
            {orgName} et Stripe, notre prestataire de services de paiement, à envoyer des instructions
            à votre banque pour débiter votre compte conformément à ces instructions. Vous avez droit
            à un remboursement par votre banque selon les conditions de votre accord bancaire.
          </p>
        </div>

        <Button
          type="submit"
          className="mt-4 h-11 w-full"
          disabled={!stripe || isProcessing || !mandateAccepted}
          aria-busy={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enregistrement du mandat…
            </>
          ) : (
            "Autoriser le prélèvement SEPA"
          )}
        </Button>

        {errorMessage && (
          <p
            ref={errorRef}
            role="alert"
            tabIndex={-1}
            className="mt-2 text-center text-xs text-red-600"
          >
            {errorMessage}
          </p>
        )}
      </form>
    );
  }

  // --- Card branch (Phase 3 — unchanged) ---
  return (
    <form onSubmit={handleCardSubmit} noValidate>
      <PaymentElement />

      <Button
        type="submit"
        className="mt-4 h-11 w-full"
        disabled={!stripe || isProcessing}
        aria-busy={isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Traitement en cours…
          </>
        ) : (
          `Payer ${formattedAmount}`
        )}
      </Button>

      {errorMessage && (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="mt-2 text-center text-xs text-red-600"
        >
          {errorMessage}
        </p>
      )}
    </form>
  );
}
