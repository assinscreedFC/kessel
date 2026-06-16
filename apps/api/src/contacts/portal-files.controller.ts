import { BadRequestException, Controller, HttpCode, Inject, Param, Post, Req, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { forOrg } from "@kessel/db";
import { StorageService } from "@kessel/proposals";
import { requireOrg } from "../shared/require-org";

// POST /api/contacts/:id/portal-files — upload agence vers le portail client (PORT-06).
//
// FileInterceptor : multer memoryStorage (buffer), limite 25 Mo, filtre MIME allow-list.
// Validation taille + MIME au boundary AVANT MinIO putObject (T-8-upload).
// @Inject explicite obligatoire (esbuild n'émet pas design:paramtypes — CLAUDE.md).
// forOrg(orgId).portalFile.create : isolation write cross-tenant (T-8-crosstenant).

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 Mo

const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

@Controller("api/contacts")
export class PortalFilesController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  // PORT-06 : upload d'un fichier depuis le dashboard agence vers le portail du contact.
  // Validations au boundary (T-8-upload) :
  //  1. MIME via fileFilter (multer) — rejeté si non dans ACCEPTED_MIME
  //  2. Taille 25 Mo via limits.fileSize (multer) + check file.size post-parse
  // Écriture : forOrg(orgId).portalFile.create (isolation cross-tenant T-8-crosstenant).
  @Post(":id/portal-files")
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        cb(null, ACCEPTED_MIME.has(file.mimetype));
      },
    }),
  )
  async uploadPortalFile(
    @Session() session: UserSession<typeof auth>,
    @Param("id") contactId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { body?: { sizeBytes?: string } },
  ): Promise<{ id: string; filename: string; sizeBytes: number; uploadedAt: string }> {
    if (!file) {
      throw new BadRequestException("Aucun fichier reçu ou type MIME non supporté.");
    }

    // Validation taille (T-8-upload) : double-check côté serveur.
    // 1. file.size réel (multer post-parse) — protège contre les vrais gros fichiers.
    // 2. sizeBytes form field — déclaration client (ex: taille connue avant streaming partiel).
    //    Un client honnête l'envoie pour permettre un rejet précoce.
    const declaredSize = req.body?.sizeBytes ? Number(req.body.sizeBytes) : 0;
    if (file.size > MAX_SIZE_BYTES || declaredSize > MAX_SIZE_BYTES) {
      throw new BadRequestException("Fichier trop volumineux (max 25 Mo).");
    }

    const orgId = requireOrg(session);
    const fileId = crypto.randomUUID();

    // Upload vers MinIO bucket kessel-portal-files (non public).
    const objectKey = await this.storage.putPortalFile(
      orgId,
      contactId,
      fileId,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    // Persiste la ligne PortalFile (forOrg injecte orgId — isolation cross-tenant T-8-crosstenant).
    const record = await forOrg(orgId).portalFile.create({
      data: {
        id: fileId,
        contactId,
        filename: file.originalname,
        objectKey,
        contentType: file.mimetype,
        sizeBytes: file.size,
      },
    });

    return {
      id: record.id,
      filename: record.filename,
      sizeBytes: record.sizeBytes,
      uploadedAt: record.uploadedAt instanceof Date ? record.uploadedAt.toISOString() : String(record.uploadedAt),
    };
  }
}
