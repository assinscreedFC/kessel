import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useSessionRole } from "@/shared/lib/use-session-role";
import { useOrgSettings, useUpdateOrgSettings } from "../api";
import type { OrgSettings, UpdateOrgSettingsInput } from "../api";

// SettingsVatPage — page /settings/vat (07-05, I18N-01 / TVA-02 / TVA-04).
// Formulaire TVA & localisation de l'org (owner). Patterns : Skeleton loading, ErrorState,
// viewer gating, toast Sonner success/error, erreur inline vatNumber (T-7-13 UX).
// L'autorité de validation n° TVA est le serveur (Plan 02, jsvat-next) — l'inline est UX uniquement.

// EU ISO 3166-1 alpha-2 country list (minimum FR + full EU).
const EU_COUNTRIES: { code: string; label: string }[] = [
  { code: "AT", label: "Autriche" },
  { code: "BE", label: "Belgique" },
  { code: "BG", label: "Bulgarie" },
  { code: "CY", label: "Chypre" },
  { code: "CZ", label: "Tchéquie" },
  { code: "DE", label: "Allemagne" },
  { code: "DK", label: "Danemark" },
  { code: "EE", label: "Estonie" },
  { code: "ES", label: "Espagne" },
  { code: "FI", label: "Finlande" },
  { code: "FR", label: "France" },
  { code: "GR", label: "Grèce" },
  { code: "HR", label: "Croatie" },
  { code: "HU", label: "Hongrie" },
  { code: "IE", label: "Irlande" },
  { code: "IT", label: "Italie" },
  { code: "LT", label: "Lituanie" },
  { code: "LU", label: "Luxembourg" },
  { code: "LV", label: "Lettonie" },
  { code: "MT", label: "Malte" },
  { code: "NL", label: "Pays-Bas" },
  { code: "PL", label: "Pologne" },
  { code: "PT", label: "Portugal" },
  { code: "RO", label: "Roumanie" },
  { code: "SE", label: "Suède" },
  { code: "SI", label: "Slovénie" },
  { code: "SK", label: "Slovaquie" },
];

function SkeletonForm() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-28" />
    </div>
  );
}

function ErrorState({ onRetry, heading, body, retry }: {
  onRetry: () => void;
  heading: string;
  body: string;
  retry: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm font-semibold text-red-600">{heading}</p>
      <p className="text-sm text-slate-500">{body}</p>
      <Button variant="outline" onClick={onRetry} className="mt-1">
        {retry}
      </Button>
    </div>
  );
}

interface VatFormProps {
  initial: OrgSettings;
  isViewer: boolean;
}

function VatForm({ initial, isViewer }: VatFormProps) {
  const { t } = useTranslation();
  const { mutate: update, isPending } = useUpdateOrgSettings();

  const [vatRegime, setVatRegime] = useState<string>(initial.vatRegime ?? "FRANCHISE");
  const [vatNumber, setVatNumber] = useState<string>(initial.vatNumber ?? "");
  const [country, setCountry] = useState<string>(initial.country ?? "FR");
  const [defaultLocale, setDefaultLocale] = useState<string>(initial.defaultLocale ?? "fr");
  const [vatNumberError, setVatNumberError] = useState<string | null>(null);

  // Sync if initial data changes (e.g. query refetch).
  useEffect(() => {
    setVatRegime(initial.vatRegime ?? "FRANCHISE");
    setVatNumber(initial.vatNumber ?? "");
    setCountry(initial.country ?? "FR");
    setDefaultLocale(initial.defaultLocale ?? "fr");
  }, [initial.vatRegime, initial.vatNumber, initial.country, initial.defaultLocale]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setVatNumberError(null);

    const input: UpdateOrgSettingsInput = {
      vatRegime: vatRegime as "FRANCHISE" | "NORMAL" | "INTRACOM",
      vatNumber: vatNumber || undefined,
      country,
      defaultLocale: defaultLocale as "fr" | "en",
    };

    update(input, {
      onSuccess: () => {
        toast.success(t("settings_vat.toast_success"));
      },
      onError: (err) => {
        if (err.isVatNumberInvalid) {
          setVatNumberError(t("settings_vat.vat_number.error_invalid"));
        } else {
          toast.error(t("settings_vat.toast_error"));
        }
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-6">
      {/* Régime de TVA */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="vat-regime">{t("settings_vat.regime.label")}</Label>
        <Select
          value={vatRegime}
          onValueChange={setVatRegime}
          disabled={isViewer || isPending}
        >
          <SelectTrigger id="vat-regime">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FRANCHISE">{t("settings_vat.regime.franchise")}</SelectItem>
            <SelectItem value="NORMAL">{t("settings_vat.regime.normal")}</SelectItem>
            <SelectItem value="INTRACOM">{t("settings_vat.regime.intracom")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Numéro de TVA */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="vat-number">{t("settings_vat.vat_number.label")}</Label>
        <Input
          id="vat-number"
          value={vatNumber}
          onChange={(e) => {
            setVatNumber(e.target.value);
            if (vatNumberError) setVatNumberError(null);
          }}
          placeholder={t("settings_vat.vat_number.placeholder")}
          disabled={isViewer || isPending}
          aria-describedby="vat-number-helper vat-number-error"
        />
        <p id="vat-number-helper" className="text-xs text-slate-500">
          {t("settings_vat.vat_number.helper")}
        </p>
        {vatNumberError && (
          <p id="vat-number-error" role="alert" className="text-xs text-red-600">
            {vatNumberError}
          </p>
        )}
      </div>

      {/* Pays */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="vat-country">{t("settings_vat.country.label")}</Label>
        <Select
          value={country}
          onValueChange={setCountry}
          disabled={isViewer || isPending}
        >
          <SelectTrigger id="vat-country">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EU_COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} — {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Langue par défaut */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="vat-locale">{t("settings_vat.default_locale.label")}</Label>
        <Select
          value={defaultLocale}
          onValueChange={setDefaultLocale}
          disabled={isViewer || isPending}
        >
          <SelectTrigger id="vat-locale">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">{t("settings_vat.default_locale.fr")}</SelectItem>
            <SelectItem value="en">{t("settings_vat.default_locale.en")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Button type="submit" disabled={isViewer || isPending}>
          {isPending ? t("settings_vat.save_pending") : t("settings_vat.save_button")}
        </Button>
      </div>
    </form>
  );
}

export function SettingsVatPage() {
  const { t } = useTranslation();
  const { isViewer } = useSessionRole();
  const { data, isPending, isError, refetch } = useOrgSettings();

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          {t("settings_vat.title")}
        </h1>
      </header>

      {isPending ? (
        <SkeletonForm />
      ) : isError ? (
        <ErrorState
          onRetry={() => void refetch()}
          heading={t("settings_vat.load_error_heading")}
          body={t("settings_vat.load_error_body")}
          retry={t("settings_vat.retry")}
        />
      ) : (
        <VatForm initial={data} isViewer={isViewer} />
      )}
    </div>
  );
}
