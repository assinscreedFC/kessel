import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";

// Checkbox — port shadcn manuel (couche `shared/ui`), le SEUL primitive net-new de la Phase 5
// (ligne de consentement du panneau de signature public). `@radix-ui/react-checkbox` n'étant pas
// installé, on porte un input checkbox natif stylé en CVA/cn (fallback explicite du plan) : focus
// ring hérité, check slate-900 (sémantique, pas un accent décoratif), même langage que button.tsx.
//
// L'input natif reste accessible (clavier, focus, label) et controllable (checked/onCheckedChange,
// signature alignée sur l'API shadcn pour un futur swap Radix sans changer les appelants).

interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, checked, onCheckedChange, ...props }, ref) {
    return (
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          className={cn(
            "peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 bg-white",
            "checked:border-slate-900 checked:bg-slate-900",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        <Check
          className="pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 text-white peer-checked:block"
          strokeWidth={3}
        />
      </span>
    );
  },
);
