import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/shared/lib/utils";

// Tooltip — port shadcn manuel (wrap @radix-ui/react-tooltip). Libellé FR des contrôles de la
// toolbar Tiptap (03-UI-SPEC : chaque bouton enveloppé dans un Tooltip "Gras"/"Italique"…).
// TooltipProvider est monté une fois autour de la toolbar (delayDuration court pour un outil dense).

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-md",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
