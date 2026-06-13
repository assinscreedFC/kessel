import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  StreamableFile,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import {
  DeliveryService,
  ProposalsService,
  type ProposalEventDto,
  type SendProposalResult,
} from "@kessel/proposals";
import type { ProposalDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateProposalDto } from "./dto/create-proposal.dto";
import { CreateFromTemplateDto } from "./dto/create-from-template.dto";
import { UpdateProposalDto } from "./dto/update-proposal.dto";
import {
  QuoteLineDto,
  ReorderQuoteLinesDto,
  UpdateQuoteLineDto,
} from "./dto/quote-line.dto";

// GET/POST/PATCH/DELETE /api/proposals (PROP-01/02/03) — derrière l'AuthGuard global, préfixe "api/"
// (Pitfall 1 Caddy, pas de setGlobalPrefix). AUCUNE restriction de rôle org (member autorisé).
// Scoping ORM + IDOR via ProposalsService -> forOrg.
@Controller("api/proposals")
export class ProposalsController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes -> token DI requis.
  constructor(
    @Inject(ProposalsService) private readonly proposals: ProposalsService,
    @Inject(DeliveryService) private readonly delivery: DeliveryService,
  ) {}

  @Get()
  async list(@Session() session: UserSession<typeof auth>): Promise<ProposalDto[]> {
    return this.proposals.listProposals(requireOrg(session));
  }

  // PROP-07 : export PDF. Déclaré AVANT :id pour que "/:id/pdf" ne soit pas capté par "/:id".
  // Scoping forOrg via ProposalsService.renderPdf -> 404 si la proposition n'est pas dans l'org
  // (T-3-pdf-iso : jamais de PDF cross-tenant). StreamableFile fixe Content-Type application/pdf
  // + Content-Disposition attachment (NestJS natif, pas de @Res express).
  @Get(":id/pdf")
  async exportPdf(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<StreamableFile> {
    const buf = await this.proposals.renderPdf(requireOrg(session), id);
    return new StreamableFile(buf, {
      type: "application/pdf",
      disposition: `attachment; filename="proposition-${id}.pdf"`,
    });
  }

  // DELIV-03 : re-download du PDF SIGNÉ depuis le dashboard (opérateur). Déclaré AVANT :id. Scoping
  // forOrg via DeliveryService.getSignedPdf -> 404 cross-org OU si pas encore signée (T-5-storage :
  // jamais de PDF signé cross-tenant, pas de presigned public). StreamableFile application/pdf.
  @Get(":id/signed-pdf")
  async exportSignedPdf(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<StreamableFile> {
    const buf = await this.delivery.getSignedPdf(requireOrg(session), id);
    if (!buf) {
      throw new NotFoundException();
    }
    return new StreamableFile(buf, {
      type: "application/pdf",
      disposition: `attachment; filename="proposition-${id}-signee.pdf"`,
    });
  }

  // DELIV-01 : envoie la proposition (génère le token, stocke son hash, status SENT + sentAt + event
  // SENT — via DeliveryService forOrg). Renvoie { token, url } pour que le sender copie le lien public.
  // POST -> pas de collision de route avec :id (verbe distinct), mais groupé ici par lisibilité.
  @Post(":id/send")
  async send(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<SendProposalResult & { url: string | null }> {
    const result = await this.delivery.sendProposal(requireOrg(session), id);
    // url = origine publique + /p/:token. Si le token n'est pas régénéré (re-send), url = null
    // (le client garde le lien existant). APP_ORIGIN sinon dérivé de BETTER_AUTH_URL (sans secret).
    const origin = (process.env.APP_ORIGIN || process.env.BETTER_AUTH_URL || "").replace(/\/+$/, "");
    const url = result.token ? `${origin}/p/${result.token}` : null;
    return { ...result, url };
  }

  // DELIV-02 : timeline des events (SENT/OPENED/VIEWED) d'une proposition de l'org. Déclaré AVANT
  // :id pour que "/:id/events" ne soit pas capté par la route paramétrée "/:id".
  @Get(":id/events")
  async events(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<ProposalEventDto[]> {
    return this.delivery.listEvents(requireOrg(session), id);
  }

  @Get(":id")
  async getOne(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<ProposalDto | null> {
    return this.proposals.getProposal(requireOrg(session), id);
  }

  @Post()
  async create(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: CreateProposalDto,
  ): Promise<ProposalDto> {
    return this.proposals.createProposal(requireOrg(session), dto);
  }

  // PROP-02 : crée une proposition en copiant le bodyJson d'un template (copie serveur, IDOR template+deal).
  @Post("from-template")
  async createFromTemplate(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: CreateFromTemplateDto,
  ): Promise<ProposalDto> {
    return this.proposals.createFromTemplate(requireOrg(session), dto);
  }

  @Patch(":id")
  async update(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: UpdateProposalDto,
  ): Promise<ProposalDto> {
    return this.proposals.updateProposal(requireOrg(session), id, dto);
  }

  @Delete(":id")
  async remove(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<void> {
    return this.proposals.deleteProposal(requireOrg(session), id);
  }

  // === Quote lines (nested sous proposal, snapshot) ===

  @Post(":id/lines")
  async addLine(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: QuoteLineDto,
  ): Promise<ProposalDto> {
    return this.proposals.addQuoteLine(requireOrg(session), id, dto);
  }

  // Réordonnancement : déclaré AVANT :lineId pour ne pas être capté par la route paramétrée.
  @Patch(":id/lines/reorder")
  async reorderLines(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: ReorderQuoteLinesDto,
  ): Promise<ProposalDto> {
    return this.proposals.reorderQuoteLines(requireOrg(session), id, dto.orderedIds);
  }

  @Patch(":id/lines/:lineId")
  async updateLine(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() dto: UpdateQuoteLineDto,
  ): Promise<ProposalDto> {
    return this.proposals.updateQuoteLine(requireOrg(session), id, lineId, dto);
  }

  @Delete(":id/lines/:lineId")
  async deleteLine(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
  ): Promise<ProposalDto> {
    return this.proposals.deleteQuoteLine(requireOrg(session), id, lineId);
  }
}
