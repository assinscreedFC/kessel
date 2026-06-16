import { useCallback, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Upload, Loader2, FileText, Image, Archive, File } from "lucide-react";
import { Skeleton } from "@/shared/ui/skeleton";
import { Badge } from "@/shared/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { toast } from "@/shared/ui/sonner";
import { useContactOverview } from "@/entities/client-org/api";
import { ActivityTimeline } from "@/features/deal-activity/ui/activity-timeline";
import type { OverviewDealDto, OverviewProposalDto, OverviewProjectDto } from "@kessel/shared";

// Vue 360 d'un contact (/contacts/:id). CRM-07.
// Header nom + email + badge ClientOrg violet (si rattaché).
// 3 sections agrégées (Deals / Propositions / Projets) + section Activité.
// Section Activité : ActivityTimeline montée sur le deal le plus récent du contact.
// Si le contact n'a aucun deal : empty-state (pas de montage ActivityTimeline, pas de crash).
// dealId calculé = deals[0]?.id (serveur retourne les deals ordonnés par createdAt desc).

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

function formatAmount(amount: string | null): string {
  if (amount == null) return "—";
  const n = Number(amount);
  return Number.isNaN(n) ? "—" : amountFormatter.format(n);
}

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: overview, isPending, isError } = useContactOverview(id ?? "");

  if (isPending) {
    return <LoadingState />;
  }

  if (isError || !overview) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm font-semibold text-red-600">Impossible de charger les données.</p>
        <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      </div>
    );
  }

  const { contact, deals, proposals, projects } = overview;

  // Calcul du deal le plus récent (serveur retourne deals ordonnés par createdAt desc, donc index 0).
  // NE PAS passer undefined ni un dealId hardcodé à ActivityTimeline.
  const mostRecentDealId = deals[0]?.id ?? null;

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{contact.name}</h1>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-slate-500">{contact.email}</span>
          {contact.clientOrgId && (
            <Badge className="bg-violet-100 text-violet-700">Organisation</Badge>
          )}
        </div>
      </header>

      {/* Section Deals */}
      <section>
        <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Deals associés</h2>
        <TableContainer>
          {deals.length === 0 ? (
            <EmptySectionState />
          ) : (
            <DealsTable deals={deals} />
          )}
        </TableContainer>
      </section>

      {/* Section Propositions */}
      <section>
        <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Propositions</h2>
        <TableContainer>
          {proposals.length === 0 ? (
            <EmptySectionState />
          ) : (
            <ProposalsTable proposals={proposals} />
          )}
        </TableContainer>
      </section>

      {/* Section Projets */}
      <section>
        <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Projets</h2>
        <TableContainer>
          {projects.length === 0 ? (
            <EmptySectionState />
          ) : (
            <ProjectsTable projects={projects} />
          )}
        </TableContainer>
      </section>

      {/* Section Activité — ActivityTimeline du deal le plus récent.
          mostRecentDealId null = contact sans deal = empty-state ; pas de crash, pas d'appel /deals/undefined/activities. */}
      <section>
        <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Activité</h2>
        {mostRecentDealId !== null ? (
          <ActivityTimeline dealId={mostRecentDealId} />
        ) : (
          <p className="py-4 text-center text-sm text-slate-400">
            Aucun deal — ajoutez un deal pour suivre les activités.
          </p>
        )}
      </section>

      {/* Section Fichiers partagés (PORT-06 — Surface 2 UI-SPEC) */}
      {id && <PortalFilesSection contactId={id} />}
    </div>
  );
}

function DealsTable({ deals }: { deals: OverviewDealDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titre</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="text-right">Montant</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deals.map((deal) => (
          <TableRow key={deal.id} className="h-10">
            <TableCell className="font-medium">{deal.title}</TableCell>
            <TableCell className="text-slate-500">{deal.status}</TableCell>
            <TableCell className="text-right tabular-nums">{formatAmount(deal.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProposalsTable({ proposals }: { proposals: OverviewProposalDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titre</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {proposals.map((p) => (
          <TableRow key={p.id} className="h-10">
            <TableCell className="font-medium">{p.title}</TableCell>
            <TableCell className="text-slate-500">{p.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProjectsTable({ projects }: { projects: OverviewProjectDto[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Titre</TableHead>
          <TableHead>Statut</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((p) => (
          <TableRow key={p.id} className="h-10">
            <TableCell className="font-medium">{p.title}</TableCell>
            <TableCell className="text-slate-500">{p.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EmptySectionState() {
  return (
    <p className="py-4 text-center text-sm text-slate-400">Aucun élément</p>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

// ---- Portal Files Section (Surface 2 — UI-SPEC Phase 8) ----

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 Mo

type UploadState = "idle" | "dragging" | "uploading" | "error_size" | "error_type" | "error_server";

type SharedFile = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function FileIcon({ contentType }: { contentType: string }) {
  if (contentType.startsWith("image/")) return <Image className="h-4 w-4 text-slate-400" aria-hidden="true" />;
  if (contentType === "application/zip" || contentType === "application/x-zip-compressed") return <Archive className="h-4 w-4 text-slate-400" aria-hidden="true" />;
  if (contentType === "application/pdf" || contentType.includes("document") || contentType.includes("text")) return <FileText className="h-4 w-4 text-slate-400" aria-hidden="true" />;
  return <File className="h-4 w-4 text-slate-400" aria-hidden="true" />;
}

function PortalFilesSection({ contactId }: { contactId: string }) {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [files, setFiles] = useState<SharedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      // Validation taille
      if (file.size > MAX_SIZE_BYTES) {
        setUploadState("error_size");
        return;
      }
      // Validation MIME (côté client — le serveur revalide)
      const accepted = [
        "application/pdf", "application/zip", "application/x-zip-compressed",
        "image/png", "image/jpeg", "image/gif", "image/webp",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain", "text/csv",
      ];
      if (!accepted.includes(file.type)) {
        setUploadState("error_type");
        return;
      }

      setUploadState("uploading");
      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch(`/api/contacts/${contactId}/portal-files`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 400) {
            setUploadState("error_size");
          } else {
            setUploadState("error_server");
            toast.error("Échec de l'upload. Vérifiez votre connexion et réessayez.");
          }
          return;
        }
        const created = (await res.json()) as SharedFile;
        setFiles((prev) => [{ ...created, contentType: file.type }, ...prev]);
        setUploadState("idle");
        toast.success("Fichier partagé avec le client.");
        if (inputRef.current) inputRef.current.value = "";
      } catch {
        setUploadState("error_server");
        toast.error("Échec de l'upload. Vérifiez votre connexion et réessayez.");
      }
    },
    [contactId],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setUploadState("dragging");
  };
  const onDragLeave = () => {
    if (uploadState === "dragging") setUploadState("idle");
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const isUploading = uploadState === "uploading";
  const isDragging = uploadState === "dragging";

  return (
    <section>
      <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-700">Fichiers partagés</h2>

      {/* Drop zone */}
      <label
        htmlFor="portal-file-input"
        className={[
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed min-h-[120px] p-4 cursor-pointer transition-colors",
          isDragging
            ? "border-indigo-400 bg-indigo-50"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
          isUploading ? "pointer-events-none opacity-60" : "",
        ].join(" ")}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isUploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-slate-300" aria-hidden="true" />
        ) : (
          <Upload className="h-8 w-8 text-slate-300" aria-hidden="true" />
        )}
        <span className="text-sm text-slate-500">Glissez un fichier ou cliquez pour sélectionner</span>
        <span className="text-xs text-slate-400">PDF, ZIP, images — max 25 Mo</span>
        <input
          ref={inputRef}
          type="file"
          id="portal-file-input"
          className="sr-only"
          accept=".pdf,.zip,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          onChange={onInputChange}
          disabled={isUploading}
        />
      </label>

      {/* Inline error alerts */}
      {uploadState === "error_size" && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          Fichier trop volumineux (max 25 Mo).
        </p>
      )}
      {uploadState === "error_type" && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          Type de fichier non supporté. Formats acceptés : PDF, ZIP, images.
        </p>
      )}

      {/* File list */}
      {files.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Aucun fichier partagé avec ce client.</p>
      ) : (
        <ul className="mt-4" aria-label="Fichiers partagés">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-3 border-b border-slate-100 h-11">
              <FileIcon contentType={f.contentType} />
              <span className="flex-1 text-sm text-slate-900 truncate">{f.filename}</span>
              <span className="text-xs text-slate-500">
                {new Date(f.uploadedAt).toLocaleDateString("fr-FR")}
              </span>
              <span className="text-xs text-slate-400">{formatFileSize(f.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
