import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Couche data de la page /settings/vat (Plan 07-05).
// GET  /api/orgs/me/settings → lecture des paramètres TVA + localisation de l'org.
// PATCH /api/orgs/me/settings → sauvegarde (owner-only côté serveur — 403 si viewer).

export interface OrgSettings {
  vatRegime: "FRANCHISE" | "NORMAL" | "INTRACOM" | null;
  vatNumber: string | null;
  country: string | null;
  defaultLocale: "fr" | "en" | null;
  // Branding (08-04, PORT-07) — renvoyés par le même endpoint GET /api/orgs/me/settings.
  logo: string | null;
  brandColor: string | null;
}

export interface UpdateOrgSettingsInput {
  vatRegime?: "FRANCHISE" | "NORMAL" | "INTRACOM";
  vatNumber?: string;
  country?: string;
  defaultLocale?: "fr" | "en";
}

const QUERY_KEY = ["org-settings"] as const;

export function useOrgSettings() {
  return useQuery<OrgSettings>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch("/api/orgs/me/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load org settings");
      return res.json() as Promise<OrgSettings>;
    },
  });
}

export interface UpdateOrgSettingsError {
  message: string;
  isVatNumberInvalid: boolean;
}

export function useUpdateOrgSettings() {
  const qc = useQueryClient();

  return useMutation<OrgSettings, UpdateOrgSettingsError, UpdateOrgSettingsInput>({
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
        const isVatNumberInvalid =
          res.status === 400 &&
          typeof rawMessage === "string" &&
          rawMessage.toLowerCase().includes("vat");
        throw {
          message: typeof rawMessage === "string" ? rawMessage : "Unknown error",
          isVatNumberInvalid,
        } satisfies UpdateOrgSettingsError;
      }

      return res.json() as Promise<OrgSettings>;
    },
    onSuccess: (data) => {
      qc.setQueryData(QUERY_KEY, data);
    },
  });
}
