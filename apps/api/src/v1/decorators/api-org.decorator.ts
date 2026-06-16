import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestWithApiOrg } from "../guards/api-key.guard";

// @ApiOrg() — param decorator pour extraire request.apiOrgId dans les controllers /api/v1/*.
//
// Utilisation : `@Get() list(@ApiOrg() orgId: string) { ... }`
// Requis : ApiKeyGuard doit avoir été exécuté avant (injecte apiOrgId).

export const ApiOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<RequestWithApiOrg>();
    return req.apiOrgId as string;
  },
);
