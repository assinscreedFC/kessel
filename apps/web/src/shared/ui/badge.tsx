import * as React from "react";
import { cn } from "@/shared/lib/utils";

// Badge — port shadcn manuel (cva/cn). Pastille statut 02-UI-SPEC : sans bordure, densité fixe.
// La TEINTE (bg-{color}-100 text-{color}-700) est passée via `className` par DEAL_STATUS_META —
// le badge lui-même reste neutre, c'est la SEULE source de hue (statuts) du design.
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
        className,
      )}
      {...props}
    />
  );
}
