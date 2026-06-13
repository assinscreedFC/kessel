import * as React from "react";
import { cn } from "@/shared/lib/utils";

// Skeleton — port shadcn manuel. Placeholder de chargement (02-UI-SPEC : pas de spinner,
// bg-slate-100 animate-pulse). Réutilisé pour les 5 lignes de la table en état loading.
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded bg-slate-100", className)}
      {...props}
    />
  );
}
