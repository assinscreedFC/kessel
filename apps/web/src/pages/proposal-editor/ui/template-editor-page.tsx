import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { useTemplate, useUpdateTemplateBodySilent } from "@/entities/template/api";
import type { Template } from "@/entities/template/model";
import { ProposalEditor } from "@/features/proposal-editor/ui/editor";
import { AutosaveIndicator } from "@/features/proposal-editor/ui/autosave-indicator";
import {
  createDebouncedSaver,
  type AutosaveState,
  type DebouncedSaver,
} from "@/features/proposal-editor/lib/debounced-saver";

// Page éditeur de TEMPLATE (route /proposals/templates/:id/edit, 03-UI-SPEC §Templates : un template a
// un CORPS SEUL — pas de quote builder ni de deal). Même surface Tiptap que la proposition, même
// autosave debounce 1.5s, mais SANS la colonne devis. Le nom (title) et le corps alimentent l'autosave.

const AUTOSAVE_DELAY_MS = 1500;

export function TemplateEditorPage() {
  const { id = "" } = useParams();
  const { data: template, isPending, isError, refetch } = useTemplate(id);

  if (isPending) return <TemplateSkeleton />;
  if (isError || !template) return <TemplateError onRetry={() => refetch()} />;

  return <LoadedTemplateEditor key={template.id} template={template} />;
}

function LoadedTemplateEditor({ template }: { template: Template }) {
  const navigate = useNavigate();
  const mutation = useUpdateTemplateBodySilent(template.id);
  const [state, setState] = useState<AutosaveState>("saved");
  const [name, setName] = useState(template.name);

  const mutateRef = useRef(mutation.mutateAsync);
  mutateRef.current = mutation.mutateAsync;

  const saverRef = useRef<DebouncedSaver<{ title?: string; bodyJson?: unknown }> | null>(null);
  if (saverRef.current === null) {
    saverRef.current = createDebouncedSaver(
      async (patch) => {
        await mutateRef.current(patch);
      },
      AUTOSAVE_DELAY_MS,
      setState,
    );
  }

  useEffect(() => {
    const saver = saverRef.current;
    return () => {
      void saver?.dispose();
    };
  }, []);

  const initialBody = useRef(template.bodyJson).current;

  const onNameChange = useCallback((value: string) => {
    setName(value);
    saverRef.current?.schedule({ title: value });
  }, []);

  const onBodyChange = useCallback((bodyJson: unknown) => {
    saverRef.current?.schedule({ bodyJson });
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-8">
        <button
          type="button"
          onClick={() => navigate("/templates")}
          className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Template sans titre"
          className="border-0 bg-transparent px-0 text-xl font-semibold tracking-tight text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
        <div className="ml-auto">
          <AutosaveIndicator state={state} />
        </div>
      </header>

      <div className="px-8 py-8">
        <ProposalEditor initialContent={initialBody} onChange={onBodyChange} />
      </div>
    </div>
  );
}

function TemplateSkeleton() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-8">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-6 w-64" />
      </header>
      <div className="px-8 py-8">
        <Skeleton className="mx-auto h-[60vh] max-w-3xl" />
      </div>
    </div>
  );
}

function TemplateError({ onRetry }: { onRetry: () => void }) {
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
