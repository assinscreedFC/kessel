import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Skeleton } from "@/shared/ui/skeleton";
import { Separator } from "@/shared/ui/separator";
import { portalApi, PortalUnauthorizedError } from "@/shared/lib/api";
import { PROPOSAL_STATUS_META } from "@/entities/proposal/status";
import { PROJECT_STATUS_META } from "@/entities/project/status";
import { PAYMENT_STATUS_META } from "@/entities/payment/model";

// Screen 2 — Dashboard portail client (lecture seule).
// 3 sections : Mes propositions (PORT-02), Mon projet (PORT-03), Paiements (PORT-04).
// Toute réponse 401 redirige vers / (JWT expiré — UI-SPEC States & Transitions).
// Aucun contrôle d'écriture : pas de checkbox, pas de bouton d'action (T-4-ui-write).

function usePortalQuery<T>(key: string, fn: () => Promise<T>) {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: [key], queryFn: fn });

  useEffect(() => {
    if (query.error instanceof PortalUnauthorizedError) {
      navigate("/", { replace: true });
    }
  }, [query.error, navigate]);

  return query;
}

export function DashboardPage() {
  const proposalsQuery = usePortalQuery("proposals", portalApi.proposals);
  const projectQuery = usePortalQuery("project", portalApi.project);
  const paymentsQuery = usePortalQuery("payments", portalApi.payments);

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Votre espace client
          </h1>
        </div>

        <Separator className="my-6 bg-slate-200" />

        {/* Section A — Mes propositions */}
        <section aria-labelledby="section-proposals">
          <h2
            id="section-proposals"
            className="text-base font-semibold text-slate-900"
          >
            Mes propositions
          </h2>

          {proposalsQuery.isLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-10 w-full" aria-hidden="true" />
              <Skeleton className="h-10 w-full" aria-hidden="true" />
              <Skeleton className="h-10 w-full" aria-hidden="true" />
            </div>
          ) : !proposalsQuery.data || proposalsQuery.data.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">Aucune proposition pour le moment.</p>
            </div>
          ) : (
            <ul className="mt-2">
              {proposalsQuery.data.map((proposal) => {
                const meta = PROPOSAL_STATUS_META[proposal.status];
                return (
                  <li
                    key={proposal.id}
                    className="flex justify-between items-center py-3 border-b border-slate-100"
                  >
                    <span className="text-sm text-slate-900">{proposal.title}</span>
                    <Badge
                      className={meta.badge}
                      aria-label={`Statut : ${meta.label}`}
                    >
                      {meta.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Separator className="my-6 bg-slate-200" />

        {/* Section B — Mon projet */}
        <section aria-labelledby="section-project">
          <h2
            id="section-project"
            className="text-base font-semibold text-slate-900"
          >
            Mon projet
          </h2>

          {projectQuery.isLoading ? (
            <div className="mt-2">
              <Skeleton className="h-32 w-full" aria-hidden="true" />
            </div>
          ) : !projectQuery.data ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">Votre projet n&apos;est pas encore disponible.</p>
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-900">
                  {projectQuery.data.title}
                </span>
                {(() => {
                  const meta = PROJECT_STATUS_META[projectQuery.data!.status];
                  return (
                    <Badge
                      className={meta.badge}
                      aria-label={`Statut : ${meta.label}`}
                    >
                      {meta.label}
                    </Badge>
                  );
                })()}
              </div>

              <Separator className="my-3 bg-slate-200" />

              {projectQuery.data.tasks.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">Aucune tâche pour ce projet.</p>
              ) : (
                <ul>
                  {projectQuery.data.tasks.map((task) => {
                    const isDone = task.done === true;
                    return (
                      <li
                        key={task.id}
                        className="flex items-center gap-2 py-1.5"
                      >
                        {isDone ? (
                          <CheckCircle2
                            className="h-4 w-4 text-slate-400"
                            aria-hidden="true"
                          />
                        ) : (
                          <Circle
                            className="h-4 w-4 text-slate-400"
                            aria-hidden="true"
                          />
                        )}
                        <span className="text-sm text-slate-700">{task.title}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        <Separator className="my-6 bg-slate-200" />

        {/* Section C — Paiements */}
        <section aria-labelledby="section-payments">
          <h2
            id="section-payments"
            className="text-base font-semibold text-slate-900"
          >
            Paiements
          </h2>

          {paymentsQuery.isLoading ? (
            <div className="mt-2 space-y-2">
              <Skeleton className="h-10 w-full" aria-hidden="true" />
              <Skeleton className="h-10 w-full" aria-hidden="true" />
            </div>
          ) : !paymentsQuery.data || paymentsQuery.data.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">Aucun paiement enregistré.</p>
            </div>
          ) : (
            <ul className="mt-2">
              {paymentsQuery.data.map((payment) => {
                const kindLabel = payment.kind === "DEPOSIT" ? "Acompte" : "Solde";
                const meta = PAYMENT_STATUS_META[payment.status];
                const formattedAmount = new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: payment.currency || "EUR",
                }).format(payment.amountCents / 100);

                return (
                  <li
                    key={payment.id}
                    className="flex justify-between items-center py-3 border-b border-slate-100"
                  >
                    <div>
                      <span className="text-sm text-slate-700">{kindLabel}</span>
                      <p className="text-xs text-slate-500">{formattedAmount}</p>
                    </div>
                    <Badge
                      className={meta.badge}
                      aria-label={`Statut : ${meta.label}`}
                    >
                      {meta.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-8 text-center text-xs text-slate-500">
          <p>Propulsé par Kessel</p>
        </footer>
      </main>
    </div>
  );
}
