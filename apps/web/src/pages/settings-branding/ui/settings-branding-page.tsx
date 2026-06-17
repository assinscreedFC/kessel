import { useState, useEffect } from "react";
import { toast } from "sonner";
import { isValidBrandColor, DEFAULT_BRAND_COLOR } from "@kessel/shared";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Skeleton } from "@/shared/ui/skeleton";
import { useSessionRole } from "@/shared/lib/use-session-role";
import { useOrgSettings, useUpdateBranding } from "../api";

// SettingsBrandingPage — page /settings/branding (Plan 08-04, PORT-07).
// Formulaire branding de l'org : logo (URL) + couleur primaire (hex).
// Patterns miroir settings-vat-page : SkeletonForm + ErrorState + viewer gating + toast Sonner.
// Validation brandColor : client-side inline UX + serveur fait autorité (BadRequestException 400).
// Anti CSS injection : isValidBrandColor (@kessel/shared) validé serveur avant persistence (T-8-css).

function SkeletonForm() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-40" />
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="text-sm font-semibold text-red-600">Impossible de charger les paramètres.</p>
      <p className="text-sm text-slate-500">Vérifiez votre connexion et réessayez.</p>
      <Button variant="outline" onClick={onRetry} className="mt-1">
        Réessayer
      </Button>
    </div>
  );
}

interface BrandingFormProps {
  initialLogo: string | null;
  initialBrandColor: string | null;
  isViewer: boolean;
}

function BrandingForm({ initialLogo, initialBrandColor, isViewer }: BrandingFormProps) {
  const { mutate: update, isPending } = useUpdateBranding();

  const [logo, setLogo] = useState<string>(initialLogo ?? "");
  const [brandColor, setBrandColor] = useState<string>(initialBrandColor ?? DEFAULT_BRAND_COLOR);
  const [colorError, setColorError] = useState<string | null>(null);

  // Sync si les données initiales changent (refetch).
  useEffect(() => {
    setLogo(initialLogo ?? "");
    setBrandColor(initialBrandColor ?? DEFAULT_BRAND_COLOR);
  }, [initialLogo, initialBrandColor]);

  function handleColorChange(value: string) {
    setBrandColor(value);
    // Validation inline : UX seulement, le serveur est l'autorité.
    if (value && !isValidBrandColor(value)) {
      setColorError("Format invalide. Utilisez un code hexadécimal (ex. #4F46E5).");
    } else {
      setColorError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Le bouton submit est désactivé tant que colorError est défini (validation inline en continu),
    // donc le chemin d'envoi est déjà protégé — pas de re-validation ici.

    update(
      {
        logo: logo || undefined,
        brandColor: brandColor || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Branding mis à jour.");
        },
        onError: (err) => {
          if (err.isBrandColorInvalid) {
            setColorError("Format invalide. Utilisez un code hexadécimal (ex. #4F46E5).");
          } else {
            toast.error("Échec de la mise à jour. Réessayez.");
          }
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-6">
      {/* Champ Logo */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="branding-logo">Logo de l&apos;organisation</Label>
        <Input
          id="branding-logo"
          type="url"
          value={logo}
          onChange={(e) => setLogo(e.target.value)}
          placeholder="https://…"
          disabled={isViewer || isPending}
          aria-describedby="branding-logo-helper"
        />
        <p id="branding-logo-helper" className="text-xs text-slate-500">
          URL de l&apos;image affichée dans l&apos;en-tête du portail client.
        </p>
        {/* Preview logo si URL non vide */}
        {logo && (
          <img
            src={logo}
            alt="Aperçu du logo"
            className="h-8 object-contain max-w-[160px] rounded border border-slate-200"
          />
        )}
      </div>

      {/* Champ Couleur principale */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="branding-color-text">Couleur principale</Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={isValidBrandColor(brandColor) ? brandColor : DEFAULT_BRAND_COLOR}
            onChange={(e) => handleColorChange(e.target.value)}
            className="h-10 w-10 rounded border border-slate-200 cursor-pointer p-1"
            aria-label="Sélecteur de couleur"
            disabled={isViewer || isPending}
          />
          <Input
            id="branding-color-text"
            type="text"
            value={brandColor}
            onChange={(e) => handleColorChange(e.target.value)}
            placeholder="#4F46E5"
            className="font-mono max-w-[120px]"
            aria-label="Couleur en hexadécimal"
            disabled={isViewer || isPending}
            aria-describedby={colorError ? "branding-color-error" : "branding-color-helper"}
          />
        </div>
        <p id="branding-color-helper" className="text-xs text-slate-500">
          Utilisée pour l&apos;en-tête et les accents du portail client.
        </p>
        {colorError && (
          <p id="branding-color-error" role="alert" className="text-xs text-red-600">
            {colorError}
          </p>
        )}
      </div>

      <div>
        <Button type="submit" disabled={isViewer || isPending || !!colorError}>
          {isPending ? "Enregistrement…" : "Enregistrer le branding"}
        </Button>
      </div>
    </form>
  );
}

export function SettingsBrandingPage() {
  const { isViewer } = useSessionRole();
  const { data, isPending, isError, refetch } = useOrgSettings();

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Apparence &amp; Branding
        </h1>
      </header>

      {isPending ? (
        <SkeletonForm />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <BrandingForm
          initialLogo={data.logo ?? null}
          initialBrandColor={data.brandColor ?? null}
          isViewer={isViewer}
        />
      )}
    </div>
  );
}
