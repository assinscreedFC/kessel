import { Injectable, type OnModuleInit } from "@nestjs/common";
import * as Minio from "minio";

// StorageService — stocke / relit le PDF signé sur MinIO (client minio v8, DELIV-03).
//
// CONFIG (RESEARCH §Pitfall 7) : tout vient de l'env (MINIO_ENDPOINT/PORT/USE_SSL/ACCESS_KEY/
// SECRET_KEY/BUCKET) — câblé dans le service api du compose (Plan 05-01). Le bucket est créé au boot
// (makeBucket idempotent, BucketAlreadyOwnedByYou avalé).
//
// CLÉ DÉTERMINISTE (T-5-idem) : `proposals/<id>/signed.pdf` — un re-sign idempotent ÉCRASE la même
// clé (pas d'objet orphelin par signature). Le bucket n'est PAS public (re-download médié par un
// endpoint authentifié forOrg OU public par hash + garde status SIGNED, T-5-storage).
//
// PORTAIL (PORT-05/06, Phase 8) : bucket dédié `kessel-portal-files` (non public). Méthodes
// putPortalFile + presignedGetObject. URL présignée JAMAIS loggée (T-8-presign).

const BUCKET = process.env.MINIO_BUCKET ?? "kessel-signed";
const PORTAL_BUCKET = process.env.MINIO_PORTAL_BUCKET ?? "kessel-portal-files";

function signedPdfKey(proposalId: string): string {
  return `proposals/${proposalId}/signed.pdf`;
}

function portalFileKey(orgId: string, contactId: string, fileId: string, filename: string): string {
  return `portal/${orgId}/${contactId}/${fileId}-${filename}`;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: Minio.Client;

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY ?? "",
      secretKey: process.env.MINIO_SECRET_KEY ?? "",
    });
  }

  // makeBucket idempotent au boot pour kessel-signed ET kessel-portal-files.
  // BucketAlreadyOwnedByYou / BucketAlreadyExists -> no-op.
  //
  // TOLÉRANT AU BOOT : si MinIO est injoignable au démarrage (ECONNREFUSED en test/CI/avant que le
  // conteneur soit prêt), on NE crashe PAS l'app — le bucket sera (re)tenté implicitement au 1er put,
  // qui surfacera alors une vraie erreur de config si MinIO reste indisponible. Cela évite de coupler
  // le boot de l'API à la disponibilité de MinIO (l'API doit servir le dashboard même sans signature).
  async onModuleInit(): Promise<void> {
    await this.ensureBucket(BUCKET);
    await this.ensureBucket(PORTAL_BUCKET);
  }

  private async ensureBucket(bucket: string): Promise<void> {
    try {
      const exists = await this.client.bucketExists(bucket);
      if (!exists) {
        await this.client.makeBucket(bucket);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "BucketAlreadyOwnedByYou" || code === "BucketAlreadyExists") {
        return;
      }
      // Connexion impossible au boot -> non fatal. Tout autre échec d'I/O réelle
      // (auth, permissions) remontera au 1er put/get.
      return;
    }
  }

  // Stocke le PDF signé sous une clé déterministe et renvoie la clé (-> Signature.signedPdfKey).
  async putSignedPdf(proposalId: string, pdf: Buffer): Promise<string> {
    const key = signedPdfKey(proposalId);
    await this.client.putObject(BUCKET, key, pdf, pdf.length, {
      "Content-Type": "application/pdf",
    });
    return key;
  }

  // Relit le PDF signé (stream MinIO -> Buffer).
  async getSignedPdf(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(BUCKET, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  // PORT-06 : upload d'un fichier portail vers le bucket kessel-portal-files (non public).
  // Clé déterministe : portal/{orgId}/{contactId}/{fileId}-{filename}.
  // Retourne la clé MinIO (stockée dans PortalFile.objectKey).
  async putPortalFile(
    orgId: string,
    contactId: string,
    fileId: string,
    filename: string,
    data: Buffer,
    contentType: string,
  ): Promise<string> {
    const key = portalFileKey(orgId, contactId, fileId, filename);
    await this.client.putObject(PORTAL_BUCKET, key, data, data.length, {
      "Content-Type": contentType,
    });
    return key;
  }

  // PORT-05 : URL présignée pour téléchargement direct client → MinIO (TTL 300s = 5 min).
  // T-8-presign : JAMAIS logger l'URL retournée — accès direct non authentifié borné dans le temps.
  async presignedGetObject(objectKey: string, ttlSeconds = 300): Promise<string> {
    return this.client.presignedGetObject(PORTAL_BUCKET, objectKey, ttlSeconds);
  }
}
