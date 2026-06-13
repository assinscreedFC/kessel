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
import type { PricingItemDto as PricingItemResponse } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { PricingItemDto, UpdatePricingItemDto } from "./dto/pricing-item.dto";

// GET/POST/PATCH/DELETE /api/pricing-items (PROP-03, grille de tarifs) — AuthGuard global, préfixe "api/".
@Controller("api/pricing-items")
export class PricingController {
  constructor(
    @Inject(ProposalsService) private readonly proposals: ProposalsService,
  ) {}

  @Get()
  async list(@Session() session: UserSession<typeof auth>): Promise<PricingItemResponse[]> {
    return this.proposals.listPricingItems(requireOrg(session));
  }

  @Get(":id")
  async getOne(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<PricingItemResponse | null> {
    return this.proposals.getPricingItem(requireOrg(session), id);
  }

  @Post()
  async create(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: PricingItemDto,
  ): Promise<PricingItemResponse> {
    return this.proposals.createPricingItem(requireOrg(session), dto);
  }

  @Patch(":id")
  async update(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: UpdatePricingItemDto,
  ): Promise<PricingItemResponse> {
    return this.proposals.updatePricingItem(requireOrg(session), id, dto);
  }

  @Delete(":id")
  async remove(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<void> {
    return this.proposals.deletePricingItem(requireOrg(session), id);
  }
}
