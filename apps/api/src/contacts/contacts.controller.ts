import { Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { CrmService } from "@kessel/crm";
import type { ContactDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";

// GET/POST/PATCH /api/contacts (CRM-01) — derrière l'AuthGuard global (Phase 1).
//
// Préfixe "api/" (Pitfall 1 Caddy) : Caddy route /api/* vers l'api SANS strip du préfixe ; NestJS doit
// donc recevoir le path complet /api/contacts (sinon 404 silencieux côté navigateur). AUCUNE restriction
// de rôle org : un member peut gérer contacts/deals (owner-only réservé à settings/billing). Le scoping ORM passe
// par CrmService -> forOrg(requireOrg(session)) : l'org active de la session est l'unique source.
@Controller("api/contacts")
export class ContactsController {
  // @Inject explicite (pas seulement le type du paramètre) : le bundle esbuild (build prod) et le
  // transform esbuild de vitest n'émettent PAS design:paramtypes (emitDecoratorMetadata non supporté).
  // Sans @Inject, le token DI serait Object -> CrmService non résolu (this.crm undefined).
  constructor(@Inject(CrmService) private readonly crm: CrmService) {}

  @Get()
  async list(@Session() session: UserSession<typeof auth>): Promise<ContactDto[]> {
    return this.crm.listContacts(requireOrg(session));
  }

  @Get(":id")
  async getOne(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<ContactDto | null> {
    return this.crm.getContact(requireOrg(session), id);
  }

  @Post()
  async create(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: CreateContactDto,
  ): Promise<ContactDto> {
    return this.crm.createContact(requireOrg(session), dto);
  }

  @Patch(":id")
  async update(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<ContactDto> {
    return this.crm.updateContact(requireOrg(session), id, dto);
  }
}
