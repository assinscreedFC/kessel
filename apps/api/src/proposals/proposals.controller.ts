import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { ProposalsService } from "@kessel/proposals";
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
  ) {}

  @Get()
  async list(@Session() session: UserSession<typeof auth>): Promise<ProposalDto[]> {
    return this.proposals.listProposals(requireOrg(session));
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
