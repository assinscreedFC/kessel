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

const BUCKET = process.env.MINIO_BUCKET ?? "kessel-signed";

function signedPdfKey(proposalId: string): string {
  return `proposals/${proposalId}/signed.pdf`;
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

  // makeBucket idempotent au boot. BucketAlreadyOwnedByYou / BucketAlreadyExists -> no-op.
  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(BUCKET);
      if (!exists) {
        await this.client.makeBucket(BUCKET);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "BucketAlreadyOwnedByYou" || code === "BucketAlreadyExists") {
        return;
      }
      throw err;
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
}
