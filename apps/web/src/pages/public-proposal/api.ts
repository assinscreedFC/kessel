import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { publicApi } from "@/shared/api/public-client";

// Couche data de la surface PUBLIQUE /p/:token. Tous les appels passent par `publicApi` (fetch SANS
// credentials — jamais de cookie dashboard, garde-fou isolation T-5-web-iso). Réutilise le QueryClient
// de l'app (le client public reste cookie-less ; seul le transport diffère du client authentifié).

// DTO public renvoyé par GET /api/public/proposals/:token (miroir du PublicProposalDto serveur,
// Plan 05-02). Aucun orgId/dealId brut (anti-énumération). Montants en string (Decimal au boundary).
export interface PublicProposal {
  title: string;
  bodyJson: unknown;
  lines: {
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
    position: number;
  }[];
  grandTotal: string;
  orgName: string;
  status: string;
}

// Réponse de POST /api/public/proposals/:token/sign (Plan 05-03). `alreadySigned` distingue le cas
// idempotent (re-signature refusée proprement) du succès de première signature.
export interface SignResult {
  signerName: string;
  signedAt: string; // ISO
  alreadySigned: boolean;
}

export interface SignInput {
  signerName: string;
  signerEmail: string;
  consent: boolean;
}

// Lecture de la proposition par token. 404 (token inconnu/révoqué/expiré) -> remonte la PublicApiError
// telle quelle (la page la traduit en état invalid-token, copie neutre, anti-énumération). `retry: false`
// pour ne pas marteler un endpoint rate-limité sur un 404 légitime.
export function usePublicProposal(token: string) {
  return useQuery<PublicProposal>({
    queryKey: ["public-proposal", token],
    queryFn: () => publicApi.get<PublicProposal>(`/public/proposals/${token}`),
    enabled: Boolean(token),
    retry: false,
  });
}

// View-tracking : POST /view UNE seule fois au montage (émet OPENED/VIEWED côté serveur). Invisible au
// client (pas d'UI), best-effort (un échec de tracking ne doit pas casser l'affichage du document).
export function useRecordView(token: string) {
  const fired = useRef(false);
  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;
    publicApi.post(`/public/proposals/${token}/view`).catch(() => {
      // Tracking best-effort : on avale l'échec (réseau / rate-limit) — il ne concerne pas le client.
    });
  }, [token]);
}

// Signature : POST /sign. Renvoie la SignResult (succès ou already-signed idempotent). Les erreurs
// (PublicApiError 503 cert absent, 4xx/5xx) remontent à l'appelant qui affiche un message sobre.
export function useSignProposal(token: string) {
  return useMutation<SignResult, Error, SignInput>({
    mutationFn: (input) => publicApi.post<SignResult>(`/public/proposals/${token}/sign`, input),
  });
}

// Déclenche un download navigateur depuis un Blob (helper interne — pas d'<a download> fabriqué deux fois).
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Télécharge le PDF NON signé (état signable) via publicApi.getBlob SANS credentials — endpoint réel
// Plan 05-02 (GET /api/public/proposals/:token/pdf).
export async function downloadUnsignedPdf(token: string): Promise<void> {
  const blob = await publicApi.getBlob(`/public/proposals/${token}/pdf`);
  triggerDownload(blob, "proposition.pdf");
}

// Télécharge le PDF SIGNÉ (success + already-signed) via publicApi.getBlob SANS credentials — endpoint
// réel Plan 05-03 (GET /api/public/proposals/:token/signed-pdf, 404 tant que !SIGNED).
export async function downloadSignedPdf(token: string): Promise<void> {
  const blob = await publicApi.getBlob(`/public/proposals/${token}/signed-pdf`);
  triggerDownload(blob, "proposition-signee.pdf");
}
