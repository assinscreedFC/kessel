import { useState } from "react";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { toast } from "@/shared/ui/sonner";
import { useGenerateApiKey } from "@/entities/api-key/api";

// GenerateKeyDialog — modale deux étapes pour la génération de clé API (API-01).
//
// Étape 1 : saisie du nom de la clé + bouton "Générer".
// Étape 2 : affichage UNE SEULE FOIS de la clé brute (T-5-ui-key-leak) :
//   - Bannière d'avertissement ambre.
//   - <code> avec la clé complète.
//   - Bouton "Copier la clé" (navigator.clipboard + toast).
//   - Bouton "Fermer" — seul moyen de fermer (Esc et overlay bloqués à l'étape 2).
//   La clé n'est jamais mise en cache TanStack ni en localStorage — seulement en state local,
//   effacée à la fermeture du modal.

interface GenerateKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateKeyDialog({ open, onOpenChange }: GenerateKeyDialogProps) {
  const [name, setName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const { mutate: generate, isPending } = useGenerateApiKey((result) => {
    setGeneratedKey(result.key);
  });

  function handleGenerate() {
    if (!name.trim()) return;
    generate(name.trim());
  }

  function handleClose() {
    // Effacer la clé brute de la mémoire à la fermeture (T-5-ui-key-leak).
    setGeneratedKey(null);
    setName("");
    onOpenChange(false);
  }

  async function handleCopy() {
    if (!generatedKey) return;
    await navigator.clipboard.writeText(generatedKey);
    toast.success("Clé copiée");
  }

  const isStep2 = generatedKey !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Étape 2 : bloquer la fermeture via Esc / overlay pour éviter de perdre la clé.
        if (isStep2 && !next) return;
        if (!next) handleClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Générer une clé API</DialogTitle>
        </DialogHeader>

        {!isStep2 ? (
          // Étape 1 — saisie du nom
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="key-name">Nom de la clé</Label>
              <Input
                id="key-name"
                placeholder="Ex : Intégration Zapier"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleGenerate();
                }}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isPending}
              >
                Annuler
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!name.trim() || isPending}
              >
                {isPending ? "Génération…" : "Générer"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          // Étape 2 — affichage unique de la clé (irréversible, pas de retour)
          <>
            <div className="flex flex-col gap-4">
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                Copiez cette clé maintenant. Elle ne sera plus affichée.
              </p>
              <code className="block w-full break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
                {generatedKey}
              </code>
              <Button variant="outline" onClick={handleCopy} className="flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Copier la clé
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Fermer</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
