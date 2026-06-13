import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, FileText, Sparkles } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { useProposals, useCreateProposal } from "@/entities/proposal/api";
import { PROPOSAL_STATUS_META } from "@/entities/proposal/status";
import { useDeals } from "@/entities/deal/api";
import { BriefDialog } from "@/features/generate-proposal/ui/brief-dialog";

// Page Propositions (couche `pages`, 03-UI-SPEC §Proposals list). Table dense (Titre / Deal / Statut
// badge Brouillon / Modifié le). CTA "Nouvelle proposition" -> Dialog (Select deal via useDeals, REQUIS
// + titre) -> useCreateProposal (corps vide) -> navigate vers l'éditeur. Row -> /proposals/:id.
// Le nom du deal est résolu côté web (le contrat serveur ne renvoie que dealId — pattern Phase 2).

const SKELETON_ROWS = 5;
const EMPTY_BODY_JSON = { type: "doc", content: [] };

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function ProposalsPage() {
  const navigate = useNavigate();
  const { data: proposals, isPending, isError, refetch } = useProposals();
  const { data: deals } = useDeals();
  const [createOpen, setCreateOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  // Deal pré-rempli du flux manuel (chemin "Rédiger manuellement" si l'IA est indisponible).
  const [prefillDealId, setPrefillDealId] = useState<string | undefined>(undefined);

  const dealName = (dealId: string) =>
    (deals ?? []).find((d) => d.id === dealId)?.title ?? "—";

  const openManual = (dealId?: string) => {
    setPrefillDealId(dealId);
    setCreateOpen(true);
  };

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Propositions</h1>
        {/* Split CTA (04-UI-SPEC §Entry point) : le chemin manuel reste aussi proéminent que l'IA. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              Nouvelle proposition
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => openManual(undefined)}>
              Proposition vierge
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setBriefOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 text-slate-500" />
              Depuis un brief (IA)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <TableContainer>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : proposals.length === 0 ? (
          <EmptyState onCreate={() => openManual(undefined)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Deal</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Modifié le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.map((proposal) => {
                const meta = PROPOSAL_STATUS_META[proposal.status];
                return (
                  <TableRow
                    key={proposal.id}
                    className="h-11 cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/proposals/${proposal.id}`)}
                  >
                    <TableCell className="font-medium">{proposal.title}</TableCell>
                    <TableCell className="text-slate-500">{dealName(proposal.dealId)}</TableCell>
                    <TableCell>
                      <Badge className={cn(meta.badge)}>{meta.label}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {dateFormatter.format(new Date(proposal.updatedAt))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <CreateProposalDialog
        open={createOpen}
        prefillDealId={prefillDealId}
        onOpenChange={setCreateOpen}
        onCreated={(id) => {
          setCreateOpen(false);
          navigate(`/proposals/${id}`);
        }}
      />

      {/* Génération IA (split CTA "Depuis un brief (IA)") : Select deal requis (vide). 503 -> chemin
          manuel pré-rempli sur le deal sélectionné. */}
      <BriefDialog
        open={briefOpen}
        onOpenChange={setBriefOpen}
        onWriteManually={(dealId) => openManual(dealId)}
      />
    </div>
  );
}

interface CreateProposalDialogProps {
  open: boolean;
  prefillDealId?: string;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

// Dialog "Nouvelle proposition" : résout le deal (Select via useDeals, REQUIS — une proposition
// appartient à un deal) + le titre, crée une proposition au corps vide puis navigue vers l'éditeur.
// `prefillDealId` : pré-sélectionne le deal (chemin "Rédiger manuellement" depuis le brief IA).
function CreateProposalDialog({
  open,
  prefillDealId,
  onOpenChange,
  onCreated,
}: CreateProposalDialogProps) {
  const { data: deals } = useDeals();
  const [dealId, setDealId] = useState("");
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setDealId(prefillDealId ?? "");
      setTitle("");
      setTouched(false);
    }
  }, [open, prefillDealId]);

  const create = useCreateProposal((proposal) => onCreated(proposal.id));

  const dealMissing = dealId === "";
  const titleMissing = title.trim() === "";

  const submit = () => {
    setTouched(true);
    if (dealMissing || titleMissing) return;
    create.mutate({ dealId, title: title.trim(), bodyJson: EMPTY_BODY_JSON });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle proposition</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <Label htmlFor="proposal-deal" className="mb-1.5">
              Deal
            </Label>
            <Select value={dealId || undefined} onValueChange={setDealId}>
              <SelectTrigger
                id="proposal-deal"
                className={cn(touched && dealMissing && "border-red-400")}
              >
                <SelectValue placeholder="Sélectionner un deal" />
              </SelectTrigger>
              <SelectContent>
                {(deals ?? []).map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    {deal.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && dealMissing && (
              <p className="mt-1 text-xs text-red-600">Sélectionnez un deal</p>
            )}
          </div>

          <div className="flex flex-col">
            <Label htmlFor="proposal-title" className="mb-1.5">
              Titre
            </Label>
            <Input
              id="proposal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={cn(touched && titleMissing && "border-red-400")}
            />
            {touched && titleMissing && (
              <p className="mt-1 text-xs text-red-600">Le titre est requis</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Annuler
          </Button>
          <Button type="button" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Création…" : "Créer la proposition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingState() {
  return (
    <div>
      {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
        <div
          key={i}
          className="flex h-11 items-center gap-4 border-b border-slate-100 px-4 last:border-0"
        >
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <FileText className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">Aucune proposition pour l'instant</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Créez une proposition depuis un deal pour commencer à chiffrer.
      </p>
      <Button onClick={onCreate} className="mt-1">
        Nouvelle proposition
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm font-semibold text-red-600">Impossible de charger les données.</p>
      <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      <Button variant="outline" onClick={onRetry} className="mt-1">
        Réessayer
      </Button>
    </div>
  );
}
