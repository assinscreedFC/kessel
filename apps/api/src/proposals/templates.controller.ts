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
import type { ProposalTemplateDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateTemplateDto, UpdateTemplateDto } from "./dto/create-template.dto";

// GET/POST/PATCH/DELETE /api/templates (PROP-02) — derrière l'AuthGuard global, préfixe "api/".
@Controller("api/templates")
export class TemplatesController {
  constructor(
    @Inject(ProposalsService) private readonly proposals: ProposalsService,
  ) {}

  @Get()
  async list(@Session() session: UserSession<typeof auth>): Promise<ProposalTemplateDto[]> {
    return this.proposals.listTemplates(requireOrg(session));
  }

  @Get(":id")
  async getOne(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<ProposalTemplateDto | null> {
    return this.proposals.getTemplate(requireOrg(session), id);
  }

  @Post()
  async create(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: CreateTemplateDto,
  ): Promise<ProposalTemplateDto> {
    return this.proposals.createTemplate(requireOrg(session), dto);
  }

  @Patch(":id")
  async update(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<ProposalTemplateDto> {
    return this.proposals.updateTemplate(requireOrg(session), id, dto);
  }

  @Delete(":id")
  async remove(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<void> {
    return this.proposals.deleteTemplate(requireOrg(session), id);
  }
}
