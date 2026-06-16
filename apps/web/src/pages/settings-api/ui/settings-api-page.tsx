import { useState } from "react";
import { Activity, Globe, Key } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { Switch } from "@/shared/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { useApiKeys } from "@/entities/api-key/api";
import { API_KEY_STATUS_META, getKeyStatus } from "@/entities/api-key/model";
import type { ApiKeyDto } from "@/entities/api-key/model";
import { useWebhookEndpoints, useToggleEndpoint } from "@/entities/webhook-endpoint/api";
import type { WebhookEndpointDto } from "@/entities/webhook-endpoint/model";
import { useWebhookDeliveries, useReplayDelivery } from "@/entities/webhook-delivery/api";
import { DELIVERY_STATUS_META } from "@/entities/webhook-delivery/model";
import { useSessionRole } from "@/shared/lib/use-session-role";
import { GenerateKeyDialog } from "@/features/generate-api-key/ui/generate-key-dialog";
import { RevokeKeyDialog } from "@/features/revoke-api-key/ui/revoke-key-dialog";
import { AddEndpointDialog } from "@/features/add-webhook-endpoint/ui/add-endpoint-dialog";
import { DeleteEndpointDialog } from "@/features/delete-webhook-endpoint/ui/delete-endpoint-dialog";

// SettingsApiPage — page Settings → API & Webhooks (API-01/03/05 UI, API-06 viewer gating).
// Structure FSD couche `pages`. 3 onglets : Clés API / Endpoints / Livraisons.
// isViewer = rôle membre lu via useSessionRole — UI gating défense en profondeur uniquement
// (le RolesGuard serveur est l'autorité — T-5-ui-viewer).

const SKELETON_ROWS = 5;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFormatter.format(new Date(iso));
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateTimeFormatter.format(new Date(iso));
}

// ─── Panel 1: Clés API ────────────────────────────────────────────────────────

interface ApiKeysPanelProps {
  isViewer: boolean;
}

function ApiKeysPanel({ isViewer }: ApiKeysPanelProps) {
  const { data: keys, isPending, isError, refetch } = useApiKeys();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyDto | null>(null);

  return (
    <section className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Clés API</h2>
        <Button onClick={() => setGenerateOpen(true)} disabled={isViewer}>
          Générer une clé
        </Button>
      </div>

      <TableContainer>
        {isPending ? (
          <KeysLoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !keys || keys.length === 0 ? (
          <EmptyState
            icon={<Key className="h-10 w-10 text-slate-300" />}
            heading="Aucune clé API"
            body="Générez une clé pour connecter vos outils externes à Kessel."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Préfixe</TableHead>
                <TableHead>Créée le</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const status = getKeyStatus(key);
                const meta = API_KEY_STATUS_META[status];
                return (
                  <TableRow key={key.id} className="h-11 hover:bg-slate-50">
                    <TableCell className="font-medium text-slate-900">{key.name}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{key.prefix}</TableCell>
                    <TableCell className="text-slate-500">{formatDate(key.createdAt)}</TableCell>
                    <TableCell>
                      <Badge className={meta.className}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {!isViewer && status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                          onClick={() => setRevokeTarget(key)}
                        >
                          Révoquer
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <GenerateKeyDialog open={generateOpen} onOpenChange={setGenerateOpen} />
      <RevokeKeyDialog
        apiKey={revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
      />
    </section>
  );
}

// ─── Panel 2: Endpoints Webhook ───────────────────────────────────────────────

interface EndpointsPanelProps {
  isViewer: boolean;
}

function EndpointsPanel({ isViewer }: EndpointsPanelProps) {
  const { data: endpoints, isPending, isError, refetch } = useWebhookEndpoints();
  const { mutate: toggleEndpoint } = useToggleEndpoint();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpointDto | null>(null);

  return (
    <section className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Endpoints Webhook</h2>
        <Button onClick={() => setAddOpen(true)} disabled={isViewer}>
          Ajouter un endpoint
        </Button>
      </div>

      <TableContainer>
        {isPending ? (
          <EndpointsLoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !endpoints || endpoints.length === 0 ? (
          <EmptyState
            icon={<Globe className="h-10 w-10 text-slate-300" />}
            heading="Aucun endpoint configuré"
            body="Ajoutez un endpoint pour recevoir les événements Kessel en temps réel."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Événements</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((ep) => (
                <TableRow key={ep.id} className="h-11 hover:bg-slate-50">
                  <TableCell className="max-w-xs truncate font-mono text-xs text-slate-700">
                    {ep.url}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(ep.events as string[]).map((evt) => (
                        <span
                          key={evt}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600"
                        >
                          {evt}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={ep.active}
                      disabled={isViewer}
                      aria-label={ep.active ? "Endpoint actif" : "Endpoint inactif"}
                      onCheckedChange={(active) => toggleEndpoint({ id: ep.id, active })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {!isViewer && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        onClick={() => setDeleteTarget(ep)}
                      >
                        Supprimer
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <AddEndpointDialog open={addOpen} onOpenChange={setAddOpen} />
      <DeleteEndpointDialog
        endpoint={deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      />
    </section>
  );
}

// ─── Panel 3: Livraisons ──────────────────────────────────────────────────────

interface DeliveriesPanelProps {
  isViewer: boolean;
}

function DeliveriesPanel({ isViewer }: DeliveriesPanelProps) {
  const { data: deliveries, isPending, isError, refetch } = useWebhookDeliveries();
  const { mutate: replay, isPending: isReplaying, variables: replayingId } = useReplayDelivery();

  return (
    <section className="mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Livraisons récentes</h2>
      </div>

      <TableContainer>
        {isPending ? (
          <DeliveriesLoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !deliveries || deliveries.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-10 w-10 text-slate-300" />}
            heading="Aucune livraison"
            body="Les livraisons apparaîtront ici dès qu'un événement sera émis."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Événement</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Code HTTP</TableHead>
                <TableHead>Horodatage</TableHead>
                {!isViewer && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((delivery) => {
                const statusMeta = DELIVERY_STATUS_META[delivery.status];
                const isThisReplaying = isReplaying && replayingId === delivery.id;
                return (
                  <TableRow key={delivery.id} className="h-11 hover:bg-slate-50">
                    <TableCell className="font-mono text-xs text-slate-700">
                      {delivery.event}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs text-slate-500">
                      {delivery.webhookEndpointId}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {delivery.responseCode ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {formatDateTime(delivery.deliveredAt ?? delivery.createdAt)}
                    </TableCell>
                    {!isViewer && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={isThisReplaying}
                          onClick={() => replay(delivery.id)}
                        >
                          {isThisReplaying ? "Envoi…" : "Rejouer"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </section>
  );
}

// ─── Shared loading / empty / error states ────────────────────────────────────

function KeysLoadingState() {
  return (
    <div>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div key={i} className="flex h-11 items-center gap-4 border-b border-slate-100 px-4 last:border-0">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function EndpointsLoadingState() {
  return (
    <div>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div key={i} className="flex h-11 items-center gap-4 border-b border-slate-100 px-4 last:border-0">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function DeliveriesLoadingState() {
  return (
    <div>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div key={i} className="flex h-11 items-center gap-4 border-b border-slate-100 px-4 last:border-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  heading: string;
  body: string;
}

function EmptyState({ icon, heading, body }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {icon}
      <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
      <p className="max-w-sm text-sm text-slate-500">{body}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm font-semibold text-red-600">
        Impossible de charger les données.
      </p>
      <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      <Button variant="outline" onClick={onRetry} className="mt-1">
        Réessayer
      </Button>
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export function SettingsApiPage() {
  const { isViewer } = useSessionRole();

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">API & Webhooks</h1>
      </header>

      <Tabs defaultValue="keys">
        <TabsList>
          <TabsTrigger value="keys">Clés API</TabsTrigger>
          <TabsTrigger value="webhooks">Endpoints</TabsTrigger>
          <TabsTrigger value="deliveries">Livraisons</TabsTrigger>
        </TabsList>

        <TabsContent value="keys">
          <ApiKeysPanel isViewer={isViewer} />
        </TabsContent>

        <TabsContent value="webhooks">
          <EndpointsPanel isViewer={isViewer} />
        </TabsContent>

        <TabsContent value="deliveries">
          <DeliveriesPanel isViewer={isViewer} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
