// PortalFileDto — réponse pour GET /portal/files (PORT-05).
// contactId + orgId inclus pour permettre les assertions d'isolation cross-contact/cross-org en test.
// presignedUrl : URL temporaire MinIO (TTL 5 min) — JAMAIS loggée (T-8-presign).
export interface PortalFileDto {
  id: string;
  contactId: string;
  orgId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  presignedUrl: string;
}
