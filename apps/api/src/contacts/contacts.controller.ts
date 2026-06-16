import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { CrmService } from "@kessel/crm";
import type { ContactDto, ContactOverviewDto, CsvImportResultDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { CreateContactDto } from "./dto/create-contact.dto";
import { UpdateContactDto } from "./dto/update-contact.dto";
import { CrmOverviewService } from "../crm/crm-overview.service";

// GET/POST/PATCH /api/contacts (CRM-01) — derrière l'AuthGuard global (Phase 1).
//
// Préfixe "api/" (Pitfall 1 Caddy) : Caddy route /api/* vers l'api SANS strip du préfixe ; NestJS doit
// donc recevoir le path complet /api/contacts (sinon 404 silencieux côté navigateur). AUCUNE restriction
// de rôle org : un member peut gérer contacts/deals (owner-only réservé à settings/billing). Le scoping ORM passe
// par CrmService -> forOrg(requireOrg(session)) : l'org active de la session est l'unique source.
//
// CRM-07 : GET :id/overview agrège deals+proposals+projects via CrmOverviewService (apps/api, FOUND-05).
// CRM-09 : POST import FileInterceptor(multer) + papaparse server-side via CrmService.importContacts.
@Controller("api/contacts")
export class ContactsController {
  // @Inject explicite (pas seulement le type du paramètre) : le bundle esbuild (build prod) et le
  // transform esbuild de vitest n'émettent PAS design:paramtypes (emitDecoratorMetadata non supporté).
  // Sans @Inject, le token DI serait Object -> CrmService non résolu (this.crm undefined).
  constructor(
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(CrmOverviewService) private readonly overview: CrmOverviewService,
  ) {}

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

  // CRM-07 : vue 360 d'un contact (deals+proposals+projects agrégés via CrmOverviewService).
  // T-6-11 : contactId d'une autre org → 404 (double WHERE id+orgId Kysely dans CrmOverviewService).
  @Get(":id/overview")
  async getOverview(
    @Session() session: UserSession<typeof auth>,
    @Param("id") id: string,
  ): Promise<ContactOverviewDto> {
    return this.overview.getContactOverview(requireOrg(session), id);
  }

  // CRM-09 : import CSV de contacts (papaparse server-side, dedup email, find-or-create ClientOrg).
  // FileInterceptor : multer gère le multipart (bodyParser.json ignore multipart — Pitfall 3 absent).
  // Limite 5MB obligatoire (T-6-13 — DoS protection).
  @Post("import")
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype === "text/csv" || file.originalname.endsWith(".csv"));
      },
    }),
  )
  async importCsv(
    @Session() session: UserSession<typeof auth>,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<CsvImportResultDto> {
    return this.crm.importContacts(requireOrg(session), file.buffer);
  }
}
