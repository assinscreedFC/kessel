import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { basePrisma, forOrg } from "@kessel/db";
import { buildBudgetSnapshot } from "@kessel/shared";
import { PdfService } from "./pdf.service";
import { SigningService } from "./signing.service";
import { StorageService } from "./storage.service";
import { grandTotal, lineTotal } from "./money";
import { buildOutcomeContext } from "./outcome-context";
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

// Entrées de signature (DTO public validé au boundary + identité signataire).
export interface SignProposalInput {
  signerName: string;
  signerEmail: string;
}

// Résultat d'une signature : confirmation minimale renvoyée au client public (pas de PII serveur,
// pas de clé MinIO ni d'orgId/dealId bruts). `alreadySigned` distingue le cas idempotent.
export interface SignProposalResult {
  signerName: string;
  signedAt: string;
  status: string;
  alreadySigned: boolean;
}

const PUBLIC_INCLUDE_LINES = { lines: { orderBy: { position: "asc" } } } as const;

@Injectable()
export class DeliveryService {
  constructor(
    @Inject(PdfService) private readonly pdf: PdfService,
    @Inject(SigningService) private readonly signing: SigningService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

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

  // === Signature (DELIV-03/04) — public token-gated, atomique, idempotent ===

  // signProposal : génère le PDF (PdfService) -> signe en PAdES (SigningService, cert via env) ->
  // stocke sur MinIO (StorageService) AVANT la transaction ; puis UNE $transaction atomique :
  // Proposal SIGNED + signedAt + Signature record (auditTrail RGPD-borné) + deal WON.
  //
  // IDEMPOTENCE (T-5-idem) : garde `status === "SIGNED"` AVANT toute génération (no-op propre, ne mute
  // pas le deal, ne crée pas de 2e Signature). Le double-POST concurrent est intercepté DANS la
  // transaction par `where: { status: { not: "SIGNED" } }` (P2025 -> no-op).
  //
  // SÉCURITÉ : résolution par hash (jamais forOrg/findMany). Cert absent -> SigningCertNotConfiguredError
  // propagée (le controller -> 503). L'auditTrail ne contient QUE des champs whitelistés/tronqués.
  async signProposal(
    token: string,
    input: SignProposalInput,
    meta?: { ip?: string },
  ): Promise<SignProposalResult> {
    const proposal = (await basePrisma.proposal.findUnique({
      where: { shareTokenHash: hashToken(token) },
    })) as { id: string; orgId: string; dealId: string; status: string; signedAt: Date | null } | null;
    if (!proposal) {
      throw new NotFoundException();
    }

    // IDEMPOTENT : déjà signée -> no-op propre (pas de re-génération, pas de 2e mutation).
    if (proposal.status === "SIGNED") {
      return {
        signerName: input.signerName,
        signedAt: (proposal.signedAt ?? new Date()).toISOString(),
        status: "SIGNED",
        alreadySigned: true,
      };
    }

    // 1. Générer le PDF À SIGNER (PdfService, données résolues par hash en interne — jamais exposées).
    const pdf = await this.renderPdfForSigning(proposal.id, proposal.orgId);

    // 2. Signer en PAdES (cert via env, SigningService). Cert absent -> erreur typée propagée.
    const { signedPdf, documentHash } = await this.signing.signWithConfiguredCert(pdf, {
      name: input.signerName,
      email: input.signerEmail,
    });

    // 3. Stocker le PDF signé sur MinIO AVANT la transaction (I/O externe hors $transaction Postgres).
    const signedPdfKey = await this.storage.putSignedPdf(proposal.id, signedPdf);

    // 4. auditTrail RGPD-borné : whitelist STRICTE (champs explicites, JAMAIS de spread d'un objet
    //    request). signedAt + ip tronquée /24 (ou null) + types d'event observés. Pas d'IP complète,
    //    pas d'User-Agent, pas de PII (miroir de ProposalEvent.meta).
    const signedAt = new Date();
    const priorEvents = (await basePrisma.proposalEvent.findMany({
      where: { proposalId: proposal.id },
      select: { type: true },
    })) as { type: string }[];
    const auditTrail = buildAuditTrail(signedAt, meta?.ip, priorEvents.map((e) => e.type));

    // 4b. Dériver le SNAPSHOT de contexte de l'issue WON AVANT la transaction (buildOutcomeContext PUR,
    //     aucune I/O). Les lignes + bodyJson sont chargés une fois ici (déjà lus côté renderPdfForSigning,
    //     mais on les recharge pour figer le snapshot exactement au moment de la résolution). Flywheel
    //     AI-01 : amount (grandTotal decimal exact) + comptes + longueur de corps — whitelist RGPD stricte.
    const outcomeRow = (await basePrisma.proposal.findUnique({
      where: { id: proposal.id },
      include: PUBLIC_INCLUDE_LINES as never,
    })) as ResolvedProposalRow | null;
    const outcomeContext = buildOutcomeContext(
      { bodyJson: outcomeRow?.bodyJson ?? null },
      outcomeRow?.lines ?? [],
    );

    // 4c. Fallback titre projet (Pitfall 1 — le deal n'est pas chargé dans le findUnique initial).
    //     Charger le deal séparément AVANT la transaction pour le fallback `proposal.title || deal.title`.
    const deal = (await basePrisma.deal.findUnique({
      where: { id: proposal.dealId },
      select: { title: true },
    })) as { title: string } | null;

    // 4d. Budget snapshot figé AVANT la transaction (données déjà disponibles dans outcomeRow.lines).
    //     buildBudgetSnapshot copie les valeurs en string primitives → immuable post-mutation QuoteLines
    //     (PROJ-02 / Pitfall 4/5). Construit hors transaction : I/O pure, aucun lock Postgres.
    const budgetSnapshot = buildBudgetSnapshot(outcomeRow?.lines ?? [], signedAt);

    // 5. UNE $transaction atomique : Proposal SIGNED + Signature + deal WON + ProposalOutcome(WON).
    try {
      await basePrisma.$transaction(async (tx) => {
        await tx.proposal.update({
          // garde concurrente : un 2e sign simultané touche 0 ligne -> P2025 -> no-op (catch).
          where: { id: proposal.id, status: { not: "SIGNED" } } as never,
          data: { status: "SIGNED", signedAt } as never,
        });
        await tx.signature.create({
          data: {
            proposalId: proposal.id,
            signerName: input.signerName,
            signerEmail: input.signerEmail,
            documentHash,
            signedPdfKey,
            auditTrail: auditTrail as never,
          } as never,
        });
        await tx.deal.update({
          where: { id: proposal.dealId },
          data: { status: "WON" } as never,
        });
        // Hook WON (AI-01) — ATOMIQUE avec SIGNED + deal WON : l'issue gagnée est figée DANS la même
        // transaction (jamais de fenêtre signé-sans-outcome). proposalId @unique = idempotence DB
        // (belt-and-suspenders avec la garde status===SIGNED ci-dessus). context = snapshot figé.
        await tx.proposalOutcome.create({
          data: {
            proposalId: proposal.id,
            outcome: "WON",
            decidedAt: signedAt,
            context: outcomeContext as never,
          } as never,
        });
        // Note : pas d'event "SIGNED" (ProposalEventType = SENT/OPENED/VIEWED uniquement, Plan 05-01).
        // La transition est tracée par Proposal.status=SIGNED + signedAt + le Signature record lui-même.

        // PROJ-01/02/03 — spin-up atomique du projet + tâches initiales (Plan 02-02).
        // Atomique avec SIGNED + deal WON + ProposalOutcome : pas de projet sans signature signée.
        // Idempotence : la garde `status === "SIGNED"` en early return court-circuite avant d'atteindre
        // cette transaction ; `proposalId @unique` est la dernière ligne de défense (P2025 concurrent
        // annule toute la transaction avant d'atteindre ce point, cf. Pitfall 2 RESEARCH).
        const project = await tx.project.create({
          data: {
            orgId: proposal.orgId,
            dealId: proposal.dealId,
            proposalId: proposal.id,
            title: (outcomeRow?.title?.trim() || deal?.title || "Projet"),
            status: "ACTIVE",
            budgetSnapshot: budgetSnapshot as never,
          } as never,
        });
        await tx.task.createMany({
          data: [...(outcomeRow?.lines ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((line) => ({
              projectId: project.id,
              title: line.description,
              position: line.position,
              done: false,
            })),
        });
      });
    } catch (err: unknown) {
      // P2025 (Record not found) = la garde `status not SIGNED` a touché 0 ligne : une signature
      // concurrente a gagné la course -> no-op idempotent (pas une erreur côté client).
      if ((err as { code?: string })?.code === "P2025") {
        const current = (await basePrisma.proposal.findUnique({
          where: { id: proposal.id },
        })) as { signedAt: Date | null } | null;
        return {
          signerName: input.signerName,
          signedAt: (current?.signedAt ?? signedAt).toISOString(),
          status: "SIGNED",
          alreadySigned: true,
        };
      }
      throw err;
    }

    return {
      signerName: input.signerName,
      signedAt: signedAt.toISOString(),
      status: "SIGNED",
      alreadySigned: false,
    };
  }

  // renderPdfForSigning : génère le PDF d'une proposition résolue (par id + orgId déjà connus en
  // interne lors du sign). Réutilise PdfService (Phase 3) — même rendu que le PDF non signé.
  private async renderPdfForSigning(proposalId: string, orgId: string): Promise<Buffer> {
    const row = (await basePrisma.proposal.findUnique({
      where: { id: proposalId },
      include: PUBLIC_INCLUDE_LINES as never,
    })) as ResolvedProposalRow | null;
    if (!row) {
      throw new NotFoundException();
    }
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
      where: { id: orgId },
    })) as { name: string } | null;
    return this.pdf.renderProposalPdf({
      title: row.title,
      bodyJson: row.bodyJson,
      lines,
      grandTotal: grandTotal(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice }))),
      org: { name: org?.name ?? "" },
    });
  }

  // getSignedPdf : re-download AUTHENTIFIÉ forOrg (dashboard opérateur). 404 cross-org (la proposition
  // d'une autre org est invisible sous forOrg) ; 404 si pas encore signée. Lit Signature.signedPdfKey
  // via la Proposal forOrg-scopée puis StorageService.getSignedPdf.
  async getSignedPdf(orgId: string, id: string): Promise<Buffer | null> {
    const proposal = (await forOrg(orgId).proposal.findUnique({
      where: { id },
      include: { signatures: { orderBy: { signedAt: "desc" }, take: 1 } } as never,
    })) as { status: string; signatures: { signedPdfKey: string }[] } | null;
    if (!proposal || proposal.status !== "SIGNED" || proposal.signatures.length === 0) {
      return null;
    }
    return this.storage.getSignedPdf(proposal.signatures[0].signedPdfKey);
  }

  // getSignedPdfByToken : re-download PUBLIC (client cookie-less). Résolu par hash, garde status
  // SIGNED (sinon null -> 404). JAMAIS forOrg, JAMAIS findMany.
  async getSignedPdfByToken(token: string): Promise<Buffer | null> {
    const proposal = (await basePrisma.proposal.findUnique({
      where: { shareTokenHash: hashToken(token) },
      include: { signatures: { orderBy: { signedAt: "desc" }, take: 1 } } as never,
    })) as { status: string; signatures: { signedPdfKey: string }[] } | null;
    if (!proposal || proposal.status !== "SIGNED" || proposal.signatures.length === 0) {
      return null;
    }
    return this.storage.getSignedPdf(proposal.signatures[0].signedPdfKey);
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

// Tronque une IPv4 à son /24, ou null (IPv6/format inconnu/absente). Minimisation RGPD.
function truncateIp(ip?: string): string | null {
  const trimmed = ip?.trim();
  if (!trimmed) return null;
  const v4 = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!v4) return null;
  return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
}

// auditTrail (Signature.auditTrail) RGPD-borné : whitelist STRICTE de champs explicites — JAMAIS de
// spread d'un objet request, JAMAIS d'IP complète/User-Agent/PII. Snapshot borné (miroir de la règle
// ProposalEvent.meta du Plan 05-01).
function buildAuditTrail(
  signedAt: Date,
  ip: string | undefined,
  eventTypes: string[],
): { signedAt: string; ipTruncated: string | null; eventTypes: string[] } {
  return {
    signedAt: signedAt.toISOString(),
    ipTruncated: truncateIp(ip),
    // Types d'event observés (dédupliqués) — pas de timestamps/PII, juste la liste des types.
    eventTypes: [...new Set(eventTypes)],
  };
}
