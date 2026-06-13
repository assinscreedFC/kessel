import { useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { useProposal } from "@/entities/proposal/api";
import type { Proposal } from "@/entities/proposal/model";
import { ProposalEditor } from "@/features/proposal-editor/ui/editor";
import { AutosaveIndicator } from "@/features/proposal-editor/ui/autosave-indicator";
import { useAutosave } from "@/features/proposal-editor/lib/use-autosave";
import { useExportPdf } from "@/features/proposal-editor/lib/use-export-pdf";
import { QuoteBuilder } from "@/features/quote-builder/ui/quote-builder";
import { AiDraftBanner } from "@/features/generate-proposal/ui/ai-draft-banner";

// Page éditeur de proposition (route /proposals/:id, 03-UI-SPEC §Proposal Editor page). Layout pleine
// largeur (WideAppShell) : header sticky (Retour + titre borderless + indicateur autosave + Exporter
// PDF) ; body two-column lg (éditeur flex-1 + quote builder w-[420px]).
//
// Le titre ET le corps alimentent le MÊME autosave (debounce 1.5s). Export PDF : flush() AVANT la
// requête (le PDF rend l'état persisté). 4 états : skeleton / erreur / chargé.

export function ProposalEditorPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const { data: proposal, isPending, isError, refetch } = useProposal(id);

  // Flag de navigation posé par le hand-off de génération IA (brief-dialog) -> affiche la bannière
  // "brouillon généré par IA". Ne gate AUCUN comportement (la proposition reste une DRAFT standard).
  const aiGenerated = (location.state as { aiGenerated?: boolean } | null)?.aiGenerated === true;

  if (isPending) return <EditorSkeleton />;
  if (isError || !proposal) return <EditorError onRetry={() => refetch()} />;

  // key=id : remonte l'éditeur (content init-once) si on navigue vers une autre proposition.
  return <LoadedEditor key={proposal.id} proposal={proposal} aiGenerated={aiGenerated} />;
}

function LoadedEditor({ proposal, aiGenerated }: { proposal: Proposal; aiGenerated: boolean }) {
  const navigate = useNavigate();
  const autosave = useAutosave(proposal.id);
  const [title, setTitle] = useState(proposal.title);
  const { exportPdf, isExporting } = useExportPdf(proposal.id, title, autosave.flush);

  // Le corps initial est lu UNE fois (ref) : on ne re-set jamais le content de Tiptap (Pitfall 2).
  const initialBody = useRef(proposal.bodyJson).current;

  const onTitleChange = (value: string) => {
    setTitle(value);
    autosave.scheduleSave({ title: value });
  };

  const onBodyChange = (bodyJson: unknown) => {
    autosave.scheduleSave({ bodyJson });
  };

  return (
    <div className="flex min-h-screen flex-col">
      {aiGenerated && <AiDraftBanner />}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-8">
        <button
          type="button"
          onClick={() => navigate("/proposals")}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Proposition sans titre"
          className="border-0 bg-transparent px-0 text-xl font-semibold tracking-tight text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
        <div className="ml-auto flex items-center gap-4">
          <AutosaveIndicator state={autosave.state} />
          <Button onClick={exportPdf} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Génération…" : "Exporter PDF"}
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-8 px-8 py-8 lg:flex-row">
        <div className="min-w-0 flex-1">
          <ProposalEditor initialContent={initialBody} onChange={onBodyChange} />
        </div>
        <div className="lg:w-[420px] lg:shrink-0">
          <QuoteBuilder proposal={proposal} />
        </div>
      </div>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-8">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="ml-auto h-9 w-32" />
      </header>
      <div className="flex flex-col gap-8 px-8 py-8 lg:flex-row">
        <Skeleton className="h-[60vh] flex-1" />
        <Skeleton className="h-[60vh] lg:w-[420px]" />
      </div>
    </div>
  );
}

function EditorError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-semibold text-red-600">Impossible de charger les données.</p>
      <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      <Button variant="outline" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  );
}
