import { useParams } from "react-router-dom";
import { CheckCircle2, LinkIcon, Download } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { Separator } from "@/shared/ui/separator";
import { cn } from "@/shared/lib/utils";
import {
  downloadSignedPdf,
  usePublicProposal,
  useRecordView,
  type PublicProposal,
} from "../api";
import { ProposalRender } from "./proposal-render";
import { SigningPanel } from "./signing-panel";

// Surface PUBLIQUE /p/:token (DELIV-01/02/03), per 05-UI-SPEC §Layout Public side + §Public Surface
// States. Montée HORS de l'AppShell authentifié (arbre isolé, aucune sidebar/chrome, aucune session).
// State-driven en 6 états : loading / signable / signing / success / already-signed / invalid-token.
// (signing + success sont gérés in-place par SigningPanel ; cette page pilote loading / signable /
// already-signed / invalid-token.) Microcopie de confiance HONNÊTE : eIDAS SES uniquement, aucun
// over-claim de poids légal supérieur (cf. Trust Signals 05-UI-SPEC).

const PUBLIC_STATUS_BADGE: Record<string, { label: string; badge: string }> = {
  SENT: { label: "Envoyée", badge: "bg-blue-100 text-blue-700" },
  SIGNED: { label: "Signée", badge: "bg-green-100 text-green-700" },
};

export function PublicProposalPage() {
  const { token = "" } = useParams();
  const query = usePublicProposal(token);

  // View-tracking (POST /view -> OPENED/VIEWED) au montage, invisible au client (RGPD : aucun pixel
  // tiers). Hook appelé inconditionnellement (ordre des hooks stable) ; no-op si token vide.
  useRecordView(token);

  if (query.isPending) return <PublicShell><DocumentSkeleton /></PublicShell>;

  // invalid-token : 404 (inconnu / révoqué / expiré). AUCUN document rendu ; copie neutre IDENTIQUE
  // pour tous les cas (anti-énumération T-5-web-enum — ne révèle ni org ni existence du token).
  if (query.isError) {
    // Toute erreur (404 inconnu/révoqué/expiré OU réseau) tombe sur la MÊME surface neutre :
    // on ne révèle ni l'org ni l'existence du token (anti-énumération). Le statut n'est pas surfacé.
    return <InvalidToken />;
  }

  return <ResolvedProposal token={token} proposal={query.data} />;
}

function ResolvedProposal({ token, proposal }: { token: string; proposal: PublicProposal }) {
  const isSigned = proposal.status === "SIGNED";
  const badge = PUBLIC_STATUS_BADGE[proposal.status];

  return (
    <PublicShell>
      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">{proposal.orgName}</span>
          {badge && <Badge className={cn(badge.badge)}>{badge.label}</Badge>}
        </div>
        <Separator className="my-4 bg-slate-200" />
        <h1 className="mb-8 text-3xl font-semibold tracking-tight text-slate-900">
          {proposal.title}
        </h1>

        <ProposalRender proposal={proposal} token={token} />

        <Separator className="my-8 bg-slate-200" />

        {isSigned ? (
          <AlreadySigned token={token} />
        ) : (
          <SigningPanel token={token} />
        )}
      </div>
      <PublicFooter />
    </PublicShell>
  );
}

// État already-signed : la proposition est déjà SIGNED (re-ouverture du lien). Aucun formulaire ;
// bloc muté + download du PDF signé (publicApi.getBlob /signed-pdf, sans credentials).
function AlreadySigned({ token }: { token: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <CheckCircle2 className="h-10 w-10 text-green-600" />
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">
        Proposition déjà signée
      </h2>
      <Button variant="outline" onClick={() => downloadSignedPdf(token)}>
        <Download className="mr-2 h-4 w-4" />
        Télécharger le PDF signé
      </Button>
    </div>
  );
}

// Layout public : champ slate-50 plein écran, colonne centrée max-w-3xl (mobile-clean : px-4 sous md).
function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-8 lg:py-16">{children}</div>
    </div>
  );
}

function PublicFooter() {
  return (
    <footer className="mt-8 text-center text-xs text-slate-500">
      <p>Propulsé par Kessel</p>
      <p className="mt-1">
        Signature électronique simple (eIDAS SES) — horodatée et scellée (PAdES).
      </p>
    </footer>
  );
}

function DocumentSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8">
      <Skeleton className="h-8 w-2/3" />
      <div className="mt-8 flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <Skeleton className="mt-10 h-32 w-full" />
    </div>
  );
}

// Carte neutre invalid-token : copie IDENTIQUE pour inconnu/révoqué/expiré/réseau (anti-énumération).
// Aucun document, aucun org, aucune info de statut. Une seule ligne footer.
function InvalidToken() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <LinkIcon className="mx-auto h-10 w-10 text-slate-400" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
          Lien indisponible
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Ce lien n'est plus valide ou a expiré. Contactez la personne qui vous l'a envoyé pour
          obtenir un nouveau lien.
        </p>
        <p className="mt-8 text-xs text-slate-500">Propulsé par Kessel</p>
      </div>
    </div>
  );
}
