import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { toast } from "@/shared/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { CsvImportResultDto } from "@kessel/shared";

// Dialog import CSV de contacts (feature `csv-import`). Upload FormData multipart vers
// POST /api/contacts/import ; affiche le résumé {imported, skipped, errors} (CRM-09).
// Garde UI : fichier >5MB -> toast.error (T-6-13 côté UI, autorité reste le serveur).

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ImportState = "idle" | "loading" | "done";

export function CsvImportDialog({ open, onOpenChange }: CsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [result, setResult] = useState<CsvImportResultDto | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const reset = () => {
    setFile(null);
    setImportState("idle");
    setResult(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) reset();
    onOpenChange(newOpen);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    if (!selected) return;
    // Guard UI 5MB (T-6-13)
    if (selected.size > 5 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 5 Mo)");
      e.target.value = "";
      return;
    }
    setFile(selected);
  };

  const handleImport = async () => {
    if (!file) return;
    setImportState("loading");

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        credentials: "include",
        body: fd,
        // PAS de Content-Type manuel — FormData génère le multipart boundary automatiquement
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: CsvImportResultDto = await res.json();
      setResult(data);
      setImportState("done");
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Import terminé");
    } catch {
      setImportState("idle");
      toast.error("L'importation a échoué. Vérifiez le format du fichier.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer des contacts depuis un CSV</DialogTitle>
          <p className="text-sm text-slate-500">
            Colonnes attendues : nom, email, organisation (optionnel). Les contacts existants (même
            email) sont ignorés.
          </p>
        </DialogHeader>

        {importState === "done" && result ? (
          <ImportSummary result={result} />
        ) : (
          <div className="flex flex-col gap-4">
            {/* Zone drag dashed */}
            <div
              className="cursor-pointer rounded-lg border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 hover:border-slate-400"
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <span className="text-sm font-medium text-slate-900">{file.name}</span>
              ) : (
                "Cliquez pour sélectionner un fichier CSV"
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {file && (
              <button
                type="button"
                className="self-start text-xs text-slate-500 underline"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Changer
              </button>
            )}
          </div>
        )}

        <DialogFooter>
          {importState === "done" ? (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Fermer
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={importState === "loading"}
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={!file || importState === "loading"}
              >
                {importState === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importation…
                  </>
                ) : (
                  "Importer"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSummary({ result }: { result: CsvImportResultDto }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-green-700">{result.imported} contact(s) importé(s)</p>
      <p className="text-sm text-slate-500">{result.skipped} ignoré(s) (déjà existants)</p>
      {result.errors.length > 0 && (
        <div>
          <p className="text-sm text-red-600">Erreurs :</p>
          <ul className="pl-2">
            {result.errors.map((err, i) => (
              <li key={i} className="text-xs font-mono text-red-500">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
