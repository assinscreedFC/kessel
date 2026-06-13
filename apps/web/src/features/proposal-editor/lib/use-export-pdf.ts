import { useState } from "react";
import { api } from "@/shared/api/client";
import { toast } from "@/shared/ui/sonner";

// useExportPdf — déclenche l'export PDF (PROP-07). Contrat 03-UI-SPEC :
// 1. flush l'autosave AVANT la requête (le PDF rend l'état PERSISTÉ, jamais des edits en mémoire — Pitfall 4).
// 2. GET /api/proposals/:id/pdf en blob (credentials:include) -> download via <a download>.
// 3. busy "Génération…" pendant la requête ; erreur -> toast "Impossible de générer le PDF. Réessayez."

// Slugifie le titre pour le filename (proposition-<slug>.pdf).
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire les accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "proposition" : slug;
}

export function useExportPdf(proposalId: string, title: string, flush: () => Promise<void>) {
  const [isExporting, setIsExporting] = useState(false);

  const exportPdf = async () => {
    setIsExporting(true);
    try {
      await flush(); // garantit l'état persisté côté serveur
      const blob = await api.getBlob(`/proposals/${proposalId}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposition-${slugify(title)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Impossible de générer le PDF. Réessayez.");
    } finally {
      setIsExporting(false);
    }
  };

  return { exportPdf, isExporting };
}
