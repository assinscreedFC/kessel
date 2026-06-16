import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

// RbacModule (API-06) — monte RolesGuard comme guard global via APP_GUARD.
//
// Ordre d'exécution NestJS : les APP_GUARDs s'exécutent dans l'ordre de leur enregistrement
// dans les modules (depth-first imports). AuthModule.forRoot (importé dans AppModule avant
// RbacModule) installe le AuthGuard Better Auth en premier — il attache req.session.
// RolesGuard s'exécute après et lit req.session (déjà posé par AuthGuard).
//
// Routes exemptées automatiquement : RolesGuard retourne true si req.session est absent
// (/api/v1/*, /portal/*, /api/public/* → ces routes sont gérées par ApiKeyGuard ou
// ClientPortalGuard ; le guard global Better Auth ne leur pose pas de session).
@Module({
  providers: [
    RolesGuard,
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class RbacModule {}
