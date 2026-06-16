import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { CrmService } from "@kessel/crm";
import {
  DeliveryService,
  OutcomeService,
  PdfService,
  ProposalsService,
  SigningService,
  StorageService,
} from "@kessel/proposals";
import { ProjectsService } from "@kessel/projects";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { ApiKeyThrottlerGuard } from "./guards/api-key-throttler.guard";
import { ApiKeysController } from "../settings/api-keys.controller";
import { V1DealsController } from "./v1-deals.controller";
import { V1ProposalsController } from "./v1-proposals.controller";
import { V1ProjectsController } from "./v1-projects.controller";

// V1Module — API publique versionnée /api/v1/* + dashboard gestion clés API /api/settings/api-keys.
//
// ThrottlerModule.forRootAsync : limite configurée via API_RATE_LIMIT_PER_MIN (env, défaut 100).
// Lue à l'initialisation du module (dynamic import via useFactory) pour permettre l'override en test
// (v1-deals.spec.ts pose API_RATE_LIMIT_PER_MIN=5 avant bootTestApp → dynamic import).
//
// Domain services fournis explicitement (CrmService, ProposalsService, ProjectsService + deps) :
// AppModule et V1Module ne partagent PAS les providers automatiquement (pas de SharedModule) —
// il faut les déclarer ici pour que le DI NestJS les résolve dans les controllers v1.
//
// ProposalsService nécessite ses dépendances (PdfService, SigningService, StorageService,
// DeliveryService, OutcomeService) — miroir du provider set dans AppModule.
//
// Guards exportés : ApiKeyGuard + ApiKeyThrottlerGuard pour consommation inter-module.
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const limit = parseInt(process.env.API_RATE_LIMIT_PER_MIN ?? "100", 10);
        return [{ ttl: 60_000, limit }];
      },
    }),
  ],
  controllers: [
    ApiKeysController,
    V1DealsController,
    V1ProposalsController,
    V1ProjectsController,
  ],
  providers: [
    ApiKeyService,
    ApiKeyGuard,
    ApiKeyThrottlerGuard,
    // Domain services (explicit — not auto-shared from AppModule)
    CrmService,
    ProposalsService,
    PdfService,
    SigningService,
    StorageService,
    DeliveryService,
    OutcomeService,
    ProjectsService,
  ],
  exports: [ApiKeyService, ApiKeyGuard, ApiKeyThrottlerGuard],
})
export class V1Module {}
