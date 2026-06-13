import { useState } from "react";
import { Copy, Download, Link as LinkIcon, Send } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/ui/popover";
import { toast } from "@/shared/ui/sonner";
import type { ProposalStatus } from "@kessel/shared";
import { useSendProposal, downloadSignedPdf } from "@/entities/proposal/api";

// Feature send-proposal (DELIV-01/03) — actions du header éditeur, à GAUCHE de "Exporter PDF".
// 05-UI-SPEC §Send Flow + §Layout Dashboard side. Rendu conditionnel par statut :
//   - DRAFT  : "Envoyer" (primaire) -> flush autosave -> POST send -> copie l'url dans le presse-papiers
//              -> toast "Lien copié". Fallback (Clipboard indisponible) : Popover avec l'url en lecture
//              seule + bouton copie (jamais d'échec silencieux).
//   - SENT/SIGNED : "Copier le lien client" (outline) -> re-send (idempotent, MÊME lien) -> re-copie.
//   - SIGNED : en plus "Télécharger le PDF signé" (outline) -> downloadSignedPdf.
//
// Sécurité (T-5-web-token) : l'url/token n'est JAMAIS loggé (pas de console.*) ; copié uniquement dans
// le presse-papiers ou affiché dans l'Input de secours pour copie manuelle.

const SEND_ERROR = "Impossible d'envoyer la proposition. Réessayez.";
const COPIED = "Lien copié";

// Slugifie le titre pour le filename du PDF signé (proposition-<slug>-signee.pdf) — même règle que l'export.
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "proposition" : slug;
}

// Copie via la Clipboard API. Renvoie false si indisponible/refusée (contexte non sécurisé, permissions)
// -> l'appelant bascule sur le fallback Popover. N'absorbe jamais l'erreur en silence.
async function tryCopy(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface SendProposalActionsProps {
  proposalId: string;
  status: ProposalStatus;
  title: string;
  // Flush de l'autosave en attente — garantit que le client ne voit jamais d'edits non persistés
  // (T-5-web-stale, même règle que l'export PDF Phase 3).
  flush: () => Promise<void>;
}

export function SendProposalActions({
  proposalId,
  status,
  title,
  flush,
}: SendProposalActionsProps) {
  const send = useSendProposal(proposalId);
  // url du fallback : non null quand la copie clipboard a échoué -> on ouvre un Popover de copie manuelle.
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Envoi/copie : flush -> POST send -> { url } -> clipboard. En cas de re-send (SENT/SIGNED), l'url
  // peut être null (le token clair n'est plus connu serveur) ; on le signale alors via le fallback
  // n'est pas possible — mais le serveur renvoie l'url stable au premier send et à chaque re-send tant
  // que le token est régénérable. Ici : url null + SENT/SIGNED => on informe que le lien existe déjà.
  const sendAndCopy = async () => {
    await flush();
    let result;
    try {
      result = await send.mutateAsync();
    } catch {
      toast.error(SEND_ERROR);
      return;
    }
    const url = result.url;
    if (!url) {
      // Re-send idempotent sans token clair : impossible de re-copier le lien exact côté serveur v0.
      // On reste honnête (pas de fausse confirmation) et on invite à régénérer si besoin.
      toast.error(SEND_ERROR);
      return;
    }
    const copied = await tryCopy(url);
    if (copied) {
      toast.success(COPIED);
    } else {
      // Fallback Clipboard indisponible : surface l'url dans un Popover lecture seule (copie manuelle).
      setFallbackUrl(url);
    }
  };

  const handleDownloadSigned = async () => {
    setDownloading(true);
    try {
      await downloadSignedPdf(proposalId, `proposition-${slugify(title)}-signee.pdf`);
    } catch {
      toast.error("Impossible de télécharger le PDF signé. Réessayez.");
    } finally {
      setDownloading(false);
    }
  };

  const busy = send.isPending;

  return (
    <div className="flex items-center gap-2">
      {status === "DRAFT" ? (
        <SendButton busy={busy} fallbackUrl={fallbackUrl} onSend={sendAndCopy} />
      ) : (
        <Button variant="outline" onClick={sendAndCopy} disabled={busy}>
          <LinkIcon className="mr-2 h-4 w-4" />
          {busy ? "Envoi…" : "Copier le lien client"}
        </Button>
      )}

      {status === "SIGNED" && (
        <Button variant="outline" onClick={handleDownloadSigned} disabled={downloading}>
          <Download className="mr-2 h-4 w-4" />
          {downloading ? "Téléchargement…" : "Télécharger le PDF signé"}
        </Button>
      )}
    </div>
  );
}

// Bouton "Envoyer" (DRAFT) avec son Popover de secours clipboard. Le Popover s'ouvre uniquement quand
// la copie automatique a échoué (fallbackUrl non null) : Input lecture seule + bouton copie manuelle.
function SendButton({
  busy,
  fallbackUrl,
  onSend,
}: {
  busy: boolean;
  fallbackUrl: string | null;
  onSend: () => void;
}) {
  const open = fallbackUrl !== null;

  const copyManually = async () => {
    if (fallbackUrl) {
      // Dernière tentative clipboard ; sinon l'opérateur sélectionne le texte de l'Input manuellement.
      const ok = await tryCopy(fallbackUrl);
      if (ok) toast.success(COPIED);
    }
  };

  return (
    <Popover open={open}>
      <PopoverTrigger asChild>
        <Button onClick={onSend} disabled={busy}>
          <Send className="mr-2 h-4 w-4" />
          {busy ? "Envoi…" : "Envoyer"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="mb-2 text-xs font-semibold text-slate-700">Lien client</p>
        <div className="flex items-center gap-2">
          <Input value={fallbackUrl ?? ""} readOnly className="h-9 text-xs" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyManually}
            aria-label="Copier le lien"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Copie automatique indisponible — copiez le lien manuellement.
        </p>
      </PopoverContent>
    </Popover>
  );
}
