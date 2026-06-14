import { Badge } from "@/shared/ui/badge";
import { PAYMENT_STATUS_META } from "@/entities/payment/model";
import type { PaymentDto } from "@/entities/project/model";

// Section "Paiements" sur la page détail projet (PAY-05 dashboard agence).
// Affiche un badge statut (En attente / Payé / Échoué) par paiement (acompte + solde).
// Inséré entre la ligne "Budget figé" et le tableau de tâches (03-UI-SPEC §Layout extension).

interface PaymentStatusSectionProps {
  payments: PaymentDto[];
}

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

const KIND_LABEL: Record<"DEPOSIT" | "BALANCE", string> = {
  DEPOSIT: "Acompte",
  BALANCE: "Solde",
};

export function PaymentStatusSection({ payments }: PaymentStatusSectionProps) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Paiements</h2>
      {payments.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun paiement déclenché.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {payments.map((payment) => {
            const meta = PAYMENT_STATUS_META[payment.status];
            const label = `${KIND_LABEL[payment.kind]} — ${formatAmount(payment.amountCents, payment.currency)}`;
            return (
              <div key={payment.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{label}</span>
                <Badge className={meta.badge}>{meta.label}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

