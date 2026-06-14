import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Elements } from "@stripe/react-stripe-js";
import { CheckCircle2, LinkIcon, Lock } from "lucide-react";
import { Separator } from "@/shared/ui/separator";
import { Skeleton } from "@/shared/ui/skeleton";
import { stripePromise } from "@/shared/lib/stripe";
import { usePublicPayment } from "../api";
import { CheckoutForm } from "./checkout-form";

// Page de paiement publique tokenisée — /pay/:token (hors AppShell authentifié).
// Machine à 6 états pilotée par la 03-UI-SPEC §States & Transitions :
//   loading → (404/réseau) → expired  [terminal, anti-énumération T-3-enum]
//   loading → (client_secret reçu) → ready → processing → succeeded | failed
//   failed → (réessayer) → ready  [bouton "Réessayer" dans CheckoutForm]
//
// Seule la clé publishable (VITE_STRIPE_PUBLISHABLE_KEY) transite côté navigateur (T-3-card SAQ A).

type PageState = "loading" | "ready" | "processing" | "succeeded" | "expired";

const TITLE_BY_KIND: Record<"DEPOSIT" | "BALANCE", string> = {
  DEPOSIT: "Régler votre acompte",
  BALANCE: "Régler le solde",
};

export function PublicPaymentPage() {
  const { token = "" } = useParams();
  const query = usePublicPayment(token);
  const [pageState, setPageState] = useState<PageState>("loading");
  const succeededHeadingRef = useRef<HTMLHeadingElement>(null);

  // Passer à l'état "ready" une fois le client_secret disponible
  useEffect(() => {
    if (query.data && pageState === "loading") {
      setPageState("ready");
    }
  }, [query.data, pageState]);

  // Passer à l'état "expired" sur toute erreur (404 token inconnu, réseau, etc.)
  useEffect(() => {
    if (query.isError) {
      setPageState("expired");
    }
  }, [query.isError]);

  // Focus accessibilité : déplacer le focus vers le heading "Paiement confirmé" au montage succeeded
  useEffect(() => {
    if (pageState === "succeeded") {
      setTimeout(() => succeededHeadingRef.current?.focus(), 50);
    }
  }, [pageState]);

  // Détection retour 3DS : si payment_intent_client_secret est dans l'URL → succès
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment_intent_client_secret")) {
      setPageState("succeeded");
    }
  }, []);

  if (pageState === "expired") {
    return <ExpiredCard />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-16">
        {pageState === "loading" ? (
          <PaymentSkeleton />
        ) : query.data ? (
          <PaymentCard
            payment={query.data}
            pageState={pageState}
            succeededHeadingRef={succeededHeadingRef}
            onSucceeded={() => setPageState("succeeded")}
            onProcessing={(processing) => setPageState(processing ? "processing" : "ready")}
          />
        ) : null}
        <footer className="mt-8 text-center text-xs text-slate-500">
          <p>Propulsé par Kessel</p>
        </footer>
      </div>
    </div>
  );
}

interface PaymentCardProps {
  payment: {
    clientSecret: string;
    kind: "DEPOSIT" | "BALANCE";
    amountCents: number;
    currency: string;
    orgName: string;
  };
  pageState: PageState;
  succeededHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  onSucceeded: () => void;
  onProcessing: (processing: boolean) => void;
}

function PaymentCard({ payment, pageState, succeededHeadingRef, onSucceeded, onProcessing }: PaymentCardProps) {
  const formattedAmount = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: payment.currency || "EUR",
  }).format(payment.amountCents / 100);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      {pageState === "succeeded" ? (
        // État succeeded : remplace le corps de la carte in-place
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden="true" />
          <h2
            ref={succeededHeadingRef as React.RefObject<HTMLHeadingElement>}
            tabIndex={-1}
            className="text-xl font-semibold tracking-tight text-slate-900"
          >
            Paiement confirmé
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Merci. Votre paiement a bien été enregistré.
          </p>
        </div>
      ) : (
        // États ready / processing
        <>
          <p className="text-sm font-semibold text-slate-900">{payment.orgName}</p>
          <Separator className="my-4 bg-slate-200" />
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {TITLE_BY_KIND[payment.kind]}
          </h1>
          <p className="my-4 text-3xl font-semibold text-slate-900">{formattedAmount}</p>
          <Separator className="my-4 bg-slate-200" />

          <Elements stripe={stripePromise} options={{ clientSecret: payment.clientSecret }}>
            <CheckoutForm
              amountCents={payment.amountCents}
              currency={payment.currency}
              onSucceeded={onSucceeded}
              onProcessing={onProcessing}
            />
          </Elements>

          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Paiement sécurisé par Stripe. Aucune donnée de carte ne transite par nos serveurs.</span>
          </div>
        </>
      )}
    </div>
  );
}

function PaymentSkeleton() {
  return (
    <div
      className="rounded-lg border border-slate-200 bg-white p-6"
      role="status"
      aria-label="Chargement"
    >
      <Skeleton className="h-6 w-32" aria-hidden="true" />
      <Skeleton className="mt-4 h-20 w-full" aria-hidden="true" />
      <Skeleton className="mt-4 h-11 w-full" aria-hidden="true" />
    </div>
  );
}

// Carte expirée / token invalide — copie IDENTIQUE à InvalidToken de la page publique-proposition.
// Anti-énumération T-3-enum : même surface pour token inconnu, révoqué, ou réseau.
function ExpiredCard() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <LinkIcon className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
          Lien indisponible
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Ce lien n'est plus valide ou a expiré. Contactez la personne qui vous l'a envoyé pour
          obtenir un nouveau lien.
        </p>
        <p className="mt-8 text-xs text-slate-500">Propulsé par Kessel</p>
      </div>
    </div>
  );
}
