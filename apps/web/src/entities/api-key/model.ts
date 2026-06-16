// Modèle de l'entité ApiKey côté web (couche `entities`).
//
// ApiKeyDto : shape retournée par GET /api/settings/api-keys (sans keyHash ni clé brute).
// API_KEY_STATUS_META : lookup badge par statut (active / revoked) — utilisé dans le tableau.
// isRevoked : helper dérivé de revokedAt (null = active).

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revokedAt: string | null;
}

export type ApiKeyStatus = "active" | "revoked";

export interface ApiKeyStatusMeta {
  label: string;
  className: string;
}

export const API_KEY_STATUS_META: Record<ApiKeyStatus, ApiKeyStatusMeta> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-700",
  },
  revoked: {
    label: "Révoquée",
    className: "bg-slate-100 text-slate-500",
  },
};

export function isRevoked(key: ApiKeyDto): boolean {
  return key.revokedAt !== null;
}

export function getKeyStatus(key: ApiKeyDto): ApiKeyStatus {
  return isRevoked(key) ? "revoked" : "active";
}
