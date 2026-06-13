import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate, MoreHorizontal } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useCreateFromTemplate,
} from "@/entities/template/api";
import type { Template } from "@/entities/template/model";
import { useDeals } from "@/entities/deal/api";

// Page Templates (couche `pages`). Couvre PROP-02 côté front (03-UI-SPEC "Templates page") : table
// dense (Nom / Modifié le muted / actions). Action principale "Utiliser ce template" -> Dialog
// "Choisir le deal" (Select via useDeals + titre) -> POST /api/proposals/from-template (deal RÉSOLU,
// jamais hardcodé : une proposition appartient à un deal) -> navigate vers l'éditeur (Plan 05) + toast.
// DropdownMenu par ligne : Renommer (Dialog) + Supprimer (AlertDialog). CTA "Nouveau template" crée un
// template vierge puis navigue vers l'éditeur de template (Plan 05). 4 états obligatoires.

const SKELETON_ROWS = 5;

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function TemplatesPage() {
  const navigate = useNavigate();
  const { data: templates, isPending, isError, refetch } = useTemplates();

  const [useDialogTemplate, setUseDialogTemplate] = useState<Template | null>(null);
  const [renameTemplate, setRenameTemplate] = useState<Template | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null);

  // Nouveau template vierge -> navigue vers l'éditeur de template (route livrée Plan 05).
  const createTemplate = useCreateTemplate((template) =>
    navigate(`/proposals/templates/${template.id}/edit`),
  );

  const deleteTemplate = useDeleteTemplate(() => setPendingDelete(null));

  return (
    <div>
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Templates</h1>
        <Button
          onClick={() => createTemplate.mutate("Nouveau template")}
          disabled={createTemplate.isPending}
        >
          {createTemplate.isPending ? "Création…" : "Nouveau template"}
        </Button>
      </header>

      <TableContainer>
        {isPending ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : templates.length === 0 ? (
          <EmptyState
            onCreate={() => createTemplate.mutate("Nouveau template")}
            disabled={createTemplate.isPending}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Modifié le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => (
                <TableRow
                  key={template.id}
                  className="group h-11 cursor-pointer hover:bg-slate-50"
                  onClick={() => navigate(`/proposals/templates/${template.id}/edit`)}
                >
                  <TableCell className="font-medium">{template.name}</TableCell>
                  <TableCell className="text-slate-500">
                    {dateFormatter.format(new Date(template.updatedAt))}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUseDialogTemplate(template)}
                      >
                        Utiliser ce template
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setRenameTemplate(template)}>
                            Renommer
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            destructive
                            onSelect={() => setPendingDelete(template)}
                          >
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <UseTemplateDialog
        template={useDialogTemplate}
        onOpenChange={(open) => !open && setUseDialogTemplate(null)}
        onCreated={(proposal) => {
          setUseDialogTemplate(null);
          navigate(`/proposals/${proposal.id}`);
        }}
      />

      <RenameTemplateDialog
        template={renameTemplate}
        onOpenChange={(open) => !open && setRenameTemplate(null)}
      />

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce template ?</AlertDialogTitle>
            <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" disabled={deleteTemplate.isPending}>
                Annuler
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                className={cn("bg-red-600 text-white hover:bg-red-600/90")}
                disabled={deleteTemplate.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (pendingDelete) deleteTemplate.mutate(pendingDelete.id);
                }}
              >
                {deleteTemplate.isPending ? "Suppression…" : "Supprimer"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Dialog "Utiliser ce template" : résout le deal (Select via useDeals, REQUIS) + le titre, puis
// POST from-template -> navigate éditeur. Le deal n'est JAMAIS hardcodé (une proposition appartient à
// un deal — décision Phase 3).
interface UseTemplateDialogProps {
  template: Template | null;
  onOpenChange: (open: boolean) => void;
  onCreated: (proposal: import("@kessel/shared").ProposalDto) => void;
}

function UseTemplateDialog({ template, onOpenChange, onCreated }: UseTemplateDialogProps) {
  const open = template != null;
  const { data: deals } = useDeals();
  const [dealId, setDealId] = useState("");
  const [title, setTitle] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setDealId("");
      setTitle(template ? template.name : "");
      setTouched(false);
    }
  }, [open, template]);

  const createFromTemplate = useCreateFromTemplate(onCreated);

  const dealMissing = dealId === "";
  const titleMissing = title.trim() === "";

  const submit = () => {
    setTouched(true);
    if (!template || dealMissing || titleMissing) return;
    createFromTemplate.mutate({ templateId: template.id, dealId, title: title.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Utiliser ce template</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <Label htmlFor="deal" className="mb-1.5">
              Deal
            </Label>
            <Select value={dealId || undefined} onValueChange={setDealId}>
              <SelectTrigger
                id="deal"
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
            <Label htmlFor="title" className="mb-1.5">
              Titre de la proposition
            </Label>
            <Input
              id="title"
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
            disabled={createFromTemplate.isPending}
          >
            Annuler
          </Button>
          <Button type="button" onClick={submit} disabled={createFromTemplate.isPending}>
            {createFromTemplate.isPending ? "Création…" : "Créer la proposition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Dialog "Renommer" : édite le seul champ saisi d'un template (le corps passe par l'éditeur Plan 05).
interface RenameTemplateDialogProps {
  template: Template | null;
  onOpenChange: (open: boolean) => void;
}

function RenameTemplateDialog({ template, onOpenChange }: RenameTemplateDialogProps) {
  const open = template != null;
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open && template) {
      setName(template.name);
      setTouched(false);
    }
  }, [open, template]);

  const updateTemplate = useUpdateTemplate(template?.id ?? "", () => onOpenChange(false));
  const nameMissing = name.trim() === "";

  const submit = () => {
    setTouched(true);
    if (!template || nameMissing) return;
    updateTemplate.mutate(name.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renommer le template</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col">
          <Label htmlFor="template-name" className="mb-1.5">
            Nom
          </Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(touched && nameMissing && "border-red-400")}
            autoFocus
          />
          {touched && nameMissing && (
            <p className="mt-1 text-xs text-red-600">Le nom est requis</p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateTemplate.isPending}
          >
            Annuler
          </Button>
          <Button type="button" onClick={submit} disabled={updateTemplate.isPending}>
            {updateTemplate.isPending ? "Enregistrement…" : "Enregistrer"}
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
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <LayoutTemplate className="h-10 w-10 text-slate-300" />
      <h2 className="text-base font-semibold text-slate-900">Aucun template</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Créez un template pour réutiliser vos propositions types.
      </p>
      <Button onClick={onCreate} disabled={disabled} className="mt-1">
        Nouveau template
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
