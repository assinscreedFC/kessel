import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { basePrisma, forOrg } from "@kessel/db";
import { PdfService } from "./pdf.service";
import { grandTotal, lineTotal } from "./money";
import { generateShareToken, hashToken } from "./token";

// DeliveryService — envoi (token), lecture publique par hash, PDF non signé public, tracking events
// (@kessel/proposals, type:domain scope:proposals). DELIV-01 (lien client) + DELIV-02 (tracking).
//
// FRONTIÈRES (FOUND-05) : consomme @kessel/db. Deux chemins d'accès DISTINCTS et VOLONTAIRES :
//   - Dashboard authentifié (sendProposal, listEvents) : forOrg(orgId) UNIQUEMENT (scoping tenant,
//     IDOR cross-org -> 404), exactement comme ProposalsService.
//   - Public token-gated (getByToken, renderPdfByToken) : basePrisma.proposal.findUnique({ where:
//     { shareTokenHash } }) — JAMAIS forOrg (le public n'a pas de session/orgId), JAMAIS findMany
//     (anti-énumération T-5-enum). Le scoping vient du fait que le hash @unique résout EXACTEMENT
//     une proposition ; un token aléatoire -> findUnique null -> 404 indifférencié.
//
// SÉCURITÉ TOKEN (T-5-token) : sendProposal génère le token EN CLAIR (renvoyé une seule fois au
// sender pour l'URL), ne persiste QUE son hashToken(...) dans shareTokenHash. Le token brut n'est
// jamais loggé ni stocké. ProposalEvent/Signature sont HORS de SCOPED_MODELS (scopés-via-parent) :
// pour le tracking on accède toujours via la Proposal (forOrg côté dashboard, par hash côté public).

type DecimalLike = { toString(): string };

type PublicQuoteLineRow = {
  id: string;
  description: string;
  quantity: DecimalLike;
  unitPrice: DecimalLike;
  position: number;
};

type ResolvedProposalRow = {
  id: string;
  orgId: string;
  dealId: string;
  title: string;
  bodyJson: unknown;
  status: string;
  lines: PublicQuoteLineRow[];
};

// DTO public minimal : strictement le nécessaire pour l'affichage lecture seule + signature.
// AUCUN champ sensible exploitable (pas de orgId/dealId bruts -> anti-énumération cross-tenant).
export interface PublicProposalDto {
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

export interface ProposalEventDto {
  id: string;
  type: string;
  occurredAt: string;
  meta: unknown;
}

export interface SendProposalResult {
  // Token EN CLAIR — renvoyé UNE SEULE fois au sender (mis dans l'URL /p/:token côté controller).
  // Sur re-send d'une proposition déjà envoyée, le token clair est inconnu (seul le hash est stocké) :
  // `token` est alors null et le sender re-copie le lien existant via l'UI.
  token: string | null;
  status: string;
}

const PUBLIC_INCLUDE_LINES = { lines: { orderBy: { position: "asc" } } } as const;

@Injectable()
export class DeliveryService {
  constructor(@Inject(PdfService) private readonly pdf: PdfService) {}

  // === Envoi (DELIV-01) — authentifié, forOrg ===

  // sendProposal : génère le token, stocke son hash, passe la proposition à SENT + sentAt, crée un
  // ProposalEvent SENT. IDEMPOTENT : une proposition déjà SENT/SIGNED ne régénère PAS le token (le
  // lien existant reste valide) — renvoie son statut courant sans token clair. IDOR : une proposition
  // d'une autre org est invisible sous forOrg -> 404.
  async sendProposal(orgId: string, id: string): Promise<SendProposalResult> {
    const existing = (await forOrg(orgId).proposal.findUnique({
      where: { id },
    })) as { id: string; status: string } | null;
    if (!existing) {
      throw new NotFoundException("Proposition introuvable dans l'organisation.");
    }

    // Re-send sur une proposition déjà envoyée/signée : ne pas régénérer le token (idempotent).
    if (existing.status !== "DRAFT") {
      return { token: null, status: existing.status };
    }

    const token = generateShareToken();
    const updated = (await forOrg(orgId).proposal.update({
      where: { id },
      data: {
        shareTokenHash: hashToken(token),
        status: "SENT",
        sentAt: new Date(),
        // Event SENT créé en nested write via la Proposal forOrg-scopée (ProposalEvent hors SCOPED_MODELS).
        events: { create: { type: "SENT" } },
      } as never,
    })) as { status: string };

    return { token, status: updated.status };
  }

  // listEvents : timeline dashboard (DELIV-02), authentifié forOrg. Accès médié par la Proposal
  // forOrg-scopée (ProposalEvent hors SCOPED_MODELS) -> une proposition cross-org est invisible -> 404.
  async listEvents(orgId: string, id: string): Promise<ProposalEventDto[]> {
    const proposal = (await forOrg(orgId).proposal.findUnique({
      where: { id },
      include: { events: { orderBy: { occurredAt: "asc" } } } as never,
    })) as { events: { id: string; type: string; occurredAt: Date; meta: unknown }[] } | null;
    if (!proposal) {
      throw new NotFoundException("Proposition introuvable dans l'organisation.");
    }
    return proposal.events.map((e) => ({
      id: e.id,
      type: e.type,
      occurredAt: e.occurredAt.toISOString(),
      meta: e.meta ?? null,
    }));
  }

  // === Public token-gated (DELIV-01/02) — basePrisma findUnique par hash, jamais forOrg/findMany ===

  // Résolution STRICTE par hash : un seul findUnique sur l'index @unique. null si le token n'existe
  // pas. Partagé par getByToken et renderPdfByToken (DRY) — une seule source de scoping public.
  private async resolveByToken(token: string): Promise<ResolvedProposalRow | null> {
    const row = await basePrisma.proposal.findUnique({
      where: { shareTokenHash: hashToken(token) },
      include: PUBLIC_INCLUDE_LINES as never,
    });
    return (row as unknown as ResolvedProposalRow) ?? null;
  }

  // getByToken : rendu lecture seule public. Renvoie un DTO public minimal (corps + devis + total +
  // nom d'org + statut). null -> le controller renvoie 404. AUCUN orgId/dealId brut exposé.
  async getByToken(token: string): Promise<PublicProposalDto | null> {
    const row = await this.resolveByToken(token);
    if (!row) return null;

    const lines = [...row.lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => {
        const quantity = l.quantity.toString();
        const unitPrice = l.unitPrice.toString();
        return {
          id: l.id,
          description: l.description,
          quantity,
          unitPrice,
          lineTotal: lineTotal(quantity, unitPrice),
          position: l.position,
        };
      });

    // Le nom de l'org est résolu par l'orgId de la proposition (basePrisma, pas exposé au client).
    const org = (await basePrisma.organization.findUnique({
      where: { id: row.orgId },
    })) as { name: string } | null;

    return {
      title: row.title,
      bodyJson: row.bodyJson,
      lines,
      grandTotal: grandTotal(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice }))),
      orgName: org?.name ?? "",
      status: row.status,
    };
  }

  // renderPdfByToken : PDF NON signé public (bouton "Télécharger le PDF"). Résolu par hash uniquement
  // (jamais forOrg/findMany), généré on-the-fly par PdfService (Phase 3) — jamais stocké. null -> 404.
  async renderPdfByToken(token: string): Promise<Buffer | null> {
    const row = await this.resolveByToken(token);
    if (!row) return null;

    const lines = [...row.lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => {
        const quantity = l.quantity.toString();
        const unitPrice = l.unitPrice.toString();
        return {
          id: l.id,
          description: l.description,
          quantity,
          unitPrice,
          lineTotal: lineTotal(quantity, unitPrice),
          position: l.position,
        };
      });

    const org = (await basePrisma.organization.findUnique({
      where: { id: row.orgId },
    })) as { name: string } | null;

    return this.pdf.renderProposalPdf({
      title: row.title,
      bodyJson: row.bodyJson,
      lines,
      grandTotal: grandTotal(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice }))),
      org: { name: org?.name ?? "" },
    });
  }

  // recordEvent : enregistre un ProposalEvent pour une proposition résolue par TOKEN (chemin public).
  // OPENED est émis UNE SEULE fois (vérifie l'absence d'un OPENED antérieur) ; VIEWED peut être multiple.
  // meta = ip tronquée (/24) ou null (RGPD T-5-privacy). Token invalide -> 404 (pas de leak).
  async recordEvent(
    token: string,
    type: "OPENED" | "VIEWED",
    meta?: { ip?: string },
  ): Promise<void> {
    const row = await this.resolveByToken(token);
    if (!row) {
      throw new NotFoundException();
    }

    if (type === "OPENED") {
      // OPENED idempotent : ne pas créer un 2e OPENED si un existe déjà pour cette proposition.
      const prior = await basePrisma.proposalEvent.findFirst({
        where: { proposalId: row.id, type: "OPENED" },
      });
      if (prior) return;
    }

    const metaJson = buildEventMeta(meta);
    await basePrisma.proposalEvent.create({
      data: { proposalId: row.id, type, meta: metaJson as never } as never,
    });
  }
}

// Tronque une IPv4 à son /24 (x.y.z.0) — minimisation RGPD (T-5-privacy). IPv6 ou format inconnu ->
// non stocké (null). Jamais de PII brute, jamais de user-agent complet.
function buildEventMeta(meta?: { ip?: string }): { ip: string } | null {
  const ip = meta?.ip?.trim();
  if (!ip) return null;
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!v4) return null;
  return { ip: `${v4[1]}.${v4[2]}.${v4[3]}.0` };
}
