import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { envValidationSchema } from "./config/env.validation";
import { i18nModuleConfig } from "./i18n/i18n.module";
import { CrmService } from "@kessel/crm";
import {
  DeliveryService,
  OutcomeService,
  PdfService,
  ProposalsService,
  SigningService,
  StorageService,
} from "@kessel/proposals";
import { AiProposalService, AnthropicProposalGenerator, PROPOSAL_GENERATOR } from "@kessel/ai";
import { ProjectsService } from "@kessel/projects";
import { HealthController } from "./health/health.controller";
import { ProjectsController } from "./projects/projects.controller";
import { SettingsController } from "./settings/settings.controller";
import { ContactsController } from "./contacts/contacts.controller";
import { DealsController } from "./deals/deals.controller";
import { ProposalsController } from "./proposals/proposals.controller";
import { AiProposalsController } from "./proposals/ai-proposals.controller";
import { OutcomesController } from "./proposals/outcomes.controller";
import { TemplatesController } from "./proposals/templates.controller";
import { PricingController } from "./pricing/pricing.controller";
import { PublicProposalsController } from "./public/public-proposals.controller";

// App shell NestJS (FOUND-02/03). AuthModule.forRoot monte l'instance Better Auth (source
// canonique org) + installe un AuthGuard GLOBAL : toutes les routes sont protégées par défaut.
// @AllowAnonymous() ouvre explicitement une route ; @OrgRoles([...]) restreint par rôle org.
//
// CRM (Phase 2) : ContactsController + DealsController (api/contacts, api/deals) injectent CrmService
// (@kessel/crm), enregistré comme provider pour que le DI NestJS le résolve.
// ThrottlerModule.forRoot : rate-limit in-memory (mono-instance self-host v0, RESEARCH A1). Le
// ThrottlerGuard est appliqué de façon CIBLÉE via @UseGuards sur le contrôleur public uniquement
// (pas en APP_GUARD global) -> les routes authentifiées du dashboard ne sont pas throttlées.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
    }),
    AuthModule.forRoot({ auth }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),
    i18nModuleConfig,
  ],
  controllers: [
    HealthController,
    SettingsController,
    ContactsController,
    DealsController,
    ProposalsController,
    AiProposalsController,
    OutcomesController,
    TemplatesController,
    PricingController,
    PublicProposalsController,
    ProjectsController,
  ],
  // PROPOSAL_GENERATOR (token DI Symbol) bindé à l'impl Anthropic en prod. En test e2e, on l'override
  // par FakeProposalGenerator (.overrideProvider) — la SEULE I/O fakée (la DB reste réelle).
  providers: [
    CrmService,
    PdfService,
    ProposalsService,
    SigningService,
    StorageService,
    DeliveryService,
    OutcomeService,
    AiProposalService,
    ProjectsService,
    { provide: PROPOSAL_GENERATOR, useClass: AnthropicProposalGenerator },
  ],
})
export class AppModule {}
