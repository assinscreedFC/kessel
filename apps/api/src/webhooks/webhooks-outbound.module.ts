import { Module } from "@nestjs/common";
import { V1Module } from "../v1/v1.module";
import { WebhookController } from "./webhook.controller";
import { WebhookService } from "./webhook.service";
import { WebhookDispatchListener } from "./webhook-dispatch.listener";
import { SettingsWebhooksController } from "../settings/webhooks.controller";

// WebhooksOutboundModule — surface webhook complète (API-03/04/05) + routes dashboard (plan 06).
//
// imports: [V1Module] → fournit ApiKeyGuard + ApiKeyThrottlerGuard exportés par V1Module.
//   EventEmitter2 est disponible globalement (EventEmitterModule.forRoot dans AppModule).
//
// providers: WebhookService + WebhookDispatchListener.
//   - WebhookDispatchListener : @OnEvent handlers pour les 4 événements métier.
//   - WebhookService : injecte WebhookDispatchListener pour le replay.
//
// controllers:
//   - WebhookController — routes /api/v1/webhooks (API-key guarded, partenaires externes).
//   - SettingsWebhooksController — routes /api/settings/webhooks (session Better Auth, dashboard).
//
// AppModule importe déjà WebhooksOutboundModule (plan 01) — ne pas modifier app.module.ts.

@Module({
  imports: [V1Module],
  controllers: [WebhookController, SettingsWebhooksController],
  providers: [WebhookService, WebhookDispatchListener],
})
export class WebhooksOutboundModule {}
