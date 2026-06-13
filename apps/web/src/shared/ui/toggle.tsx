import * as React from "react";
import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

// Toggle — port shadcn manuel (wrap @radix-ui/react-toggle). Boutons de la toolbar Tiptap
// (03-UI-SPEC : h-8 w-8 icon-only, inactif text-slate-600 hover:bg-slate-100, actif via
// data-[state=on] bg-slate-900 text-white). L'état "on" reflète editor.isActive(...) (état du
// document, pas un état interne) — passé en prop `pressed` contrôlée par l'appelant.
const toggleVariants = cva(
  "inline-flex items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:text-slate-300 data-[state=on]:bg-slate-900 data-[state=on]:text-white",
  {
    variants: {
      size: {
        default: "h-8 w-8",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export interface ToggleProps
  extends React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root>,
    VariantProps<typeof toggleVariants> {}

export const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  ToggleProps
>(function Toggle({ className, size, ...props }, ref) {
  return (
    <TogglePrimitive.Root
      ref={ref}
      className={cn(toggleVariants({ size, className }))}
      {...props}
    />
  );
});
