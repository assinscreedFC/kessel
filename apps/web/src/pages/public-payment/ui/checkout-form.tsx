import { useRef, useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";

// CheckoutForm — formulaire de paiement embarqué (Stripe Payment Element).
// Monté DANS <Elements> — useStripe() et useElements() sont disponibles.
// Cycle : ready → processing → succeeded | failed → [retry] → ready.
// redirect:'if_required' : Stripe ne redirige que si 3DS l'impose ; le flow normal reste in-place.
// return_url OBLIGATOIRE pour les 3DS redirects (Pitfall 3 — si 3DS arrive, la page se recharge et
// détecte payment_intent_client_secret dans l'URL pour afficher succeeded).

interface CheckoutFormProps {
  amountCents: number;
  currency: string;
  onSucceeded: () => void;
  onProcessing: (processing: boolean) => void;
}

export function CheckoutForm({ amountCents, currency, onSucceeded, onProcessing }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amountCents / 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || isProcessing) return;

    setIsProcessing(true);
    onProcessing(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Obligatoire pour les redirects 3DS — la même page détectera payment_intent_client_secret.
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
      // Focus le message d'erreur pour l'accessibilité ARIA
      setTimeout(() => errorRef.current?.focus(), 50);
    } else if (paymentIntent?.status === "succeeded") {
      setIsProcessing(false);
      onProcessing(false);
      onSucceeded();
    } else {
      // Statut inattendu (requires_action géré par redirect:'if_required')
      setIsProcessing(false);
      onProcessing(false);
      setErrorMessage("Le paiement est en cours de traitement. Veuillez patienter.");
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
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
