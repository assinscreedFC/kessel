import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/ui/sonner";
import {
  useGenerateProposal,
  classifyGenerationError,
  type GenerationError,
} from "@/entities/proposal/api";
import { useDeals } from "@/entities/deal/api";
import { useTemplates } from "@/entities/template/api";
import { GenerationState } from "./generation-state";

// Dialog de génération IA (04-UI-SPEC §Brief Dialog + Entry point). Largeur max-w-xl (la seule du
// produit plus large que max-w-md, justifiée par la longue saisie libre). Deux points d'entrée :
//   - depuis un deal : `lockedDeal` fourni -> ligne statique VERROUILLÉE (pas de Select).
//   - depuis la liste propositions : Select deal REQUIS (vide au départ).
//
// La génération dure plusieurs secondes : on NE FERME PAS le Dialog à la soumission. Le corps bascule
// en GenerationState (loading multi-étapes / échec+retry / IA désactivée). Succès -> ferme, toast,
// navigate vers l'éditeur Phase 3 pré-rempli + bannière IA (flag de navigation `aiGenerated`).

export interface LockedDeal {
  id: string;
  title: string;
  contactName?: string | null;
}

interface BriefDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Deal verrouillé (entrée deal-ancrée) ; absent -> Select deal requis (entrée liste).
  lockedDeal?: LockedDeal;
  // Lance le flux "proposition vierge" Phase 3 pour le deal (quand l'IA est indisponible 503).
  onWriteManually?: (dealId: string) => void;
}

const TEMPLATE_NONE = "__none__";

type Phase = "brief" | "loading" | GenerationError;

export function BriefDialog({
  open,
  onOpenChange,
  lockedDeal,
  onWriteManually,
}: BriefDialogProps) {
  const navigate = useNavigate();
  const { data: deals } = useDeals();
  const { data: templates } = useTemplates();
  // Historique gagné : pilote la variante du hint de calibration (graceful no-history). Signal honnête
  // disponible sans nouvel endpoint (un deal WON => au moins une proposition susceptible d'être gagnée).
  const { data: wonDeals } = useDeals("WON");
  const hasWonHistory = (wonDeals ?? []).length > 0;

  const generate = useGenerateProposal();

  const [dealId, setDealId] = useState("");
  const [templateId, setTemplateId] = useState(TEMPLATE_NONE);
  const [brief, setBrief] = useState("");
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<Phase>("brief");
  const abortRef = useRef<AbortController | null>(null);

  // Reset à l'ouverture (le brief est préservé pendant la vie du Dialog, pas entre ouvertures).
  useEffect(() => {
    if (open) {
      setDealId(lockedDeal?.id ?? "");
      setTemplateId(TEMPLATE_NONE);
      setBrief("");
      setTouched(false);
      setPhase("brief");
    }
  }, [open, lockedDeal?.id]);

  const effectiveDealId = lockedDeal?.id ?? dealId;
  const dealMissing = effectiveDealId === "";
  const briefMissing = brief.trim() === "";

  const runGeneration = () => {
    setPhase("loading");
    const controller = new AbortController();
    abortRef.current = controller;
    generate.mutate(
      {
        dealId: effectiveDealId,
        templateId: templateId === TEMPLATE_NONE ? null : templateId,
        brief: brief.trim(),
        signal: controller.signal,
      },
      {
        onSuccess: (proposal) => {
          abortRef.current = null;
          onOpenChange(false);
          toast.success("Proposition générée");
          // Flag de navigation -> l'éditeur affiche la bannière "Brouillon généré par IA".
          navigate(`/proposals/${proposal.id}`, { state: { aiGenerated: true } });
        },
        onError: (error) => {
          abortRef.current = null;
          // Annulation utilisateur (abort) : on revient au brief sans erreur (brief préservé).
          if (controller.signal.aborted) {
            setPhase("brief");
            return;
          }
          setPhase(classifyGenerationError(error));
        },
      },
    );
  };

  const submit = () => {
    setTouched(true);
    if (dealMissing || briefMissing) return;
    runGeneration();
  };

  // Annulation pendant le chargement : abort la requête, retour au brief (préservé).
  const cancelGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("brief");
  };

  // Fermeture (Esc / overlay / ×) : pendant le chargement, abort aussi (pas de requête orpheline).
  const handleOpenChange = (next: boolean) => {
    if (!next && phase === "loading") {
      abortRef.current?.abort();
      abortRef.current = null;
    }
    onOpenChange(next);
  };

  const writeManually = () => {
    onOpenChange(false);
    if (effectiveDealId !== "") onWriteManually?.(effectiveDealId);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        {phase === "brief" ? (
          <>
            <DialogHeader>
              <DialogTitle>Nouvelle proposition depuis un brief</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col">
                <Label htmlFor="brief-deal" className="mb-1.5">
                  Deal
                </Label>
                {lockedDeal ? (
                  <div className="flex flex-col rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-900">{lockedDeal.title}</span>
                    {lockedDeal.contactName && (
                      <span className="text-slate-500">{lockedDeal.contactName}</span>
                    )}
                  </div>
                ) : (
                  <>
                    <Select value={dealId || undefined} onValueChange={setDealId}>
                      <SelectTrigger
                        id="brief-deal"
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
                  </>
                )}
              </div>

              <div className="flex flex-col">
                <Label htmlFor="brief-template" className="mb-1.5">
                  Template
                </Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger id="brief-template">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TEMPLATE_NONE}>Aucun (génération libre)</SelectItem>
                    {(templates ?? []).map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col">
                <Label htmlFor="brief-text" className="mb-1.5">
                  Brief
                </Label>
                <Textarea
                  id="brief-text"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Collez l'email, les notes ou le transcript de l'appel client…"
                  className={cn(touched && briefMissing && "border-red-400")}
                />
                <p className="mt-2 text-sm text-slate-500">
                  {hasWonHistory
                    ? "La proposition sera calibrée sur vos propositions gagnées passées."
                    : "La calibration s'améliore à mesure que vous gagnez des propositions."}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="button" onClick={submit} disabled={dealMissing || briefMissing}>
                Générer la proposition
              </Button>
            </DialogFooter>
          </>
        ) : (
          <GenerationState
            phase={phase}
            hasWonHistory={hasWonHistory}
            onCancel={cancelGeneration}
            onRetry={runGeneration}
            onWriteManually={writeManually}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
