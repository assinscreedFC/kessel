import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgSettings } from "../settings-vat/api";

// Couche data de la page /settings/branding (Plan 08-04, PORT-07).
// GET  /api/orgs/me/settings → inclut désormais logo + brandColor (service étendu 08-04).
// PATCH /api/orgs/me/settings → sauvegarde partielle logo + brandColor (owner-only côté serveur).
// Réutilise useOrgSettings (settings-vat/api) — même endpoint, même QUERY_KEY ["org-settings"].

export type { OrgSettings } from "../settings-vat/api";
export { useOrgSettings } from "../settings-vat/api";

export interface UpdateBrandingInput {
  logo?: string;
  brandColor?: string;
}

export interface UpdateBrandingError {
  message: string;
  isBrandColorInvalid: boolean;
}

const QUERY_KEY = ["org-settings"] as const;

export function useUpdateBranding() {
  const qc = useQueryClient();

  return useMutation<unknown, UpdateBrandingError, UpdateBrandingInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/orgs/me/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string | string[] };
        const rawMessage = Array.isArray(body.message) ? body.message[0] : (body.message ?? "");
        const isBrandColorInvalid =
          res.status === 400 &&
          typeof rawMessage === "string" &&
          rawMessage.toLowerCase().includes("brand");
        throw {
          message: typeof rawMessage === "string" ? rawMessage : "Unknown error",
          isBrandColorInvalid,
        } satisfies UpdateBrandingError;
      }

      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
    },
  });
}
