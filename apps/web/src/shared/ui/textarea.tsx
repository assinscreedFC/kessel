import * as React from "react";
import { cn } from "@/shared/lib/utils";

// Textarea — port shadcn manuel (couche `shared/ui` de la FSD), même pattern cva/cn que button.tsx.
// Net-new primitive de la Phase 4 (04-UI-SPEC) : le champ de collage du brief. AUCUNE dépendance npm
// nouvelle. Dimensions imposées par la spec : min-h-[200px] (≈12 lignes, lire un email/transcript sans
// scroll immédiat), max-h-[40vh] puis scroll interne, redimensionnable verticalement uniquement.

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[200px] max-h-[40vh] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900",
          "placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
