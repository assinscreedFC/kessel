import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { HealthController } from "./health/health.controller";
import { SettingsController } from "./settings/settings.controller";

// App shell NestJS (FOUND-02/03). AuthModule.forRoot monte l'instance Better Auth (source
// canonique org) + installe un AuthGuard GLOBAL : toutes les routes sont protégées par défaut.
// @AllowAnonymous() ouvre explicitement une route ; @OrgRoles([...]) restreint par rôle org.
@Module({
  imports: [AuthModule.forRoot({ auth })],
  controllers: [HealthController, SettingsController],
})
export class AppModule {}
