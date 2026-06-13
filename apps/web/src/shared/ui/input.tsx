import * as React from "react";
import { cn } from "@/shared/lib/utils";

// Input — port shadcn manuel (couche `shared/ui`). Champ de formulaire dense B2B (02-UI-SPEC) :
// h-10, border slate-200, focus ring. La bordure d'erreur est passée via className (border-red-400).
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900",
          "placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
