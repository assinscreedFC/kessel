import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { CrmService } from "@kessel/crm";
import { PdfService, ProposalsService } from "@kessel/proposals";
import { HealthController } from "./health/health.controller";
import { SettingsController } from "./settings/settings.controller";
import { ContactsController } from "./contacts/contacts.controller";
import { DealsController } from "./deals/deals.controller";
import { ProposalsController } from "./proposals/proposals.controller";
import { TemplatesController } from "./proposals/templates.controller";
import { PricingController } from "./pricing/pricing.controller";

// App shell NestJS (FOUND-02/03). AuthModule.forRoot monte l'instance Better Auth (source
// canonique org) + installe un AuthGuard GLOBAL : toutes les routes sont protégées par défaut.
// @AllowAnonymous() ouvre explicitement une route ; @OrgRoles([...]) restreint par rôle org.
//
// CRM (Phase 2) : ContactsController + DealsController (api/contacts, api/deals) injectent CrmService
// (@kessel/crm), enregistré comme provider pour que le DI NestJS le résolve.
@Module({
  imports: [AuthModule.forRoot({ auth })],
  controllers: [
    HealthController,
    SettingsController,
    ContactsController,
    DealsController,
    ProposalsController,
    TemplatesController,
    PricingController,
  ],
  providers: [CrmService, PdfService, ProposalsService],
})
export class AppModule {}
