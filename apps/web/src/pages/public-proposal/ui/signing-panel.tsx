import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Download, Loader2, Lock } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Checkbox } from "@/shared/ui/checkbox";
import { cn } from "@/shared/lib/utils";
import { PublicApiError } from "@/shared/api/public-client";
import { downloadSignedPdf, useSignProposal, type SignResult } from "../api";

// Panneau de SIGNATURE de la surface publique (DELIV-03), per 05-UI-SPEC §Signing Panel + §Success.
// Champs nom/email/consentement (rhf + zodResolver MIROIR du DTO serveur SignProposalDto) ; le bouton
// "Signer la proposition" est DÉSACTIVÉ tant que nom non-vide + email valide + consentement coché
// (le CTA désactivé EST l'affordance). États : idle / signing-in-progress / success / erreur. Aucune
// affordance opérateur/dashboard exposée. Microcopie HONNÊTE (SES uniquement, aucun over-claim légal).

// Schéma zod miroir du DTO serveur (signerName non-vide / signerEmail format / consent === true).
// Le serveur re-valide (autorité — T-5-web-input) ; ce schéma sert l'UX + la défense en profondeur.
const signFormSchema = z.object({
  signerName: z.string().trim().min(1, "Votre nom est requis."),
  signerEmail: z.string().trim().email("Adresse email invalide."),
  consent: z.literal(true),
});

type SignFormValues = z.infer<typeof signFormSchema>;

interface SigningPanelProps {
  token: string;
}

export function SigningPanel({ token }: SigningPanelProps) {
  const [result, setResult] = useState<SignResult | null>(null);
  const signMutation = useSignProposal(token);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignFormValues>({
    resolver: zodResolver(signFormSchema),
    mode: "onChange",
    defaultValues: { signerName: "", signerEmail: "", consent: false as unknown as true },
  });

  const values = watch();
  const consent = values.consent === true;
  // CTA conditionnel : actif uniquement si nom non-vide + email format-valide + consentement coché.
  const isValid =
    values.signerName?.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.signerEmail ?? "") &&
    consent;

  const isSigning = signMutation.isPending;

  const onSubmit = (data: SignFormValues) => {
    signMutation.mutate(
      { signerName: data.signerName.trim(), signerEmail: data.signerEmail.trim(), consent: true },
      { onSuccess: (res) => setResult(res) },
    );
  };

  // État success / just-signed : remplace le panneau in-place (le document reste visible au-dessus).
  if (result) {
    return <SignSuccess token={token} result={result} />;
  }

  const errorMessage = signMutation.isError ? errorCopy(signMutation.error) : null;

  return (
    <div className="mx-auto max-w-md">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-slate-900">
        Signer la proposition
      </h2>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col">
          <Label htmlFor="signerName" className="mb-1.5">
            Nom complet
          </Label>
          <Input
            id="signerName"
            placeholder="Votre nom complet"
            disabled={isSigning}
            readOnly={isSigning}
            {...register("signerName")}
          />
        </div>

        <div className="flex flex-col">
          <Label htmlFor="signerEmail" className="mb-1.5">
            Email
          </Label>
          <Input
            id="signerEmail"
            type="email"
            placeholder="vous@exemple.com"
            disabled={isSigning}
            readOnly={isSigning}
            className={cn(errors.signerEmail && "border-red-400")}
            {...register("signerEmail")}
          />
          {errors.signerEmail && (
            <p className="mt-1 text-xs text-red-600">{errors.signerEmail.message}</p>
          )}
        </div>

        <label className="flex items-start gap-2" htmlFor="consent">
          <Checkbox
            id="consent"
            checked={consent}
            disabled={isSigning}
            onCheckedChange={(c) =>
              setValue("consent", c as true, { shouldValidate: true, shouldDirty: true })
            }
          />
          <span className="text-sm leading-relaxed text-slate-600">
            J'ai lu la proposition et je consens à la signer électroniquement.
          </span>
        </label>

        <Button type="submit" className="w-full" disabled={!isValid || isSigning}>
          {isSigning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signature en cours…
            </>
          ) : (
            "Signer la proposition"
          )}
        </Button>

        {errorMessage && <p className="text-center text-xs text-red-600">{errorMessage}</p>}

        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <Lock className="h-3.5 w-3.5" />
          Signature électronique horodatée et conservée comme preuve.
        </p>
      </form>
    </div>
  );
}

// Bloc de confirmation après signature réussie (DELIV-03/04). Le deal -> WON est serveur, invisible.
function SignSuccess({ token, result }: { token: string; result: SignResult }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <CheckCircle2 className="h-10 w-10 text-green-600" />
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">Proposition signée</h2>
      <p className="text-sm leading-relaxed text-slate-600">
        Merci. Votre signature a bien été enregistrée. Une copie signée est disponible ci-dessous.
      </p>
      <Button onClick={() => downloadSignedPdf(token)}>
        <Download className="mr-2 h-4 w-4" />
        Télécharger le PDF signé
      </Button>
      <p className="text-xs text-slate-500">
        Signé le {formatSignedAt(result.signedAt)} par {result.signerName}. Document horodaté et
        conservé.
      </p>
    </div>
  );
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatSignedAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE_FMT.format(d).replace(",", " à");
}

// Message d'erreur SOBRE (sans leak serveur) : on distingue le cert absent (503) d'un échec générique
// via PublicApiError.status, sans exposer de détail backend.
function errorCopy(error: unknown): string {
  if (error instanceof PublicApiError && error.status === 503) {
    return "La signature est momentanément indisponible. Réessayez plus tard.";
  }
  return "Impossible de signer la proposition. Réessayez.";
}
