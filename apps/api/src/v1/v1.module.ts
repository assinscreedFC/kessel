import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ApiKeyService } from "./api-key.service";
import { ApiKeyGuard } from "./guards/api-key.guard";
import { ApiKeyThrottlerGuard } from "./guards/api-key-throttler.guard";
import { ApiKeysController } from "../settings/api-keys.controller";
import { V1DealsController } from "./v1-deals.controller";

// V1Module — API publique versionnée /api/v1/* + dashboard gestion clés API /api/settings/api-keys.
//
// ThrottlerModule.forRootAsync : limite configurée via API_RATE_LIMIT_PER_MIN (env, défaut 100).
// Lue à l'initialisation du module (dynamic import via useFactory) pour permettre l'override en test
// (v1-deals.spec.ts pose API_RATE_LIMIT_PER_MIN=5 avant bootTestApp → dynamic import).
//
// Guards exportés : ApiKeyGuard + ApiKeyThrottlerGuard pour que plan 03+ les consomme
// sans re-déclarer les providers.
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const limit = parseInt(process.env.API_RATE_LIMIT_PER_MIN ?? "100", 10);
        return [{ ttl: 60_000, limit }];
      },
    }),
  ],
  controllers: [ApiKeysController, V1DealsController],
  providers: [ApiKeyService, ApiKeyGuard, ApiKeyThrottlerGuard],
  exports: [ApiKeyService, ApiKeyGuard, ApiKeyThrottlerGuard],
})
export class V1Module {}
