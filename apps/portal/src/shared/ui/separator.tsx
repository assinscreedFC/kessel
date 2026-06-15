import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/shared/lib/utils";

// Separator — port shadcn manuel (wrap @radix-ui/react-separator). Sépare les sections du dashboard
// portail (04-UI-SPEC : my-6 bg-slate-200 entre les 3 sections).
export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator(
  { className, orientation = "horizontal", decorative = true, ...props },
  ref,
) {
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-slate-200",
        orientation === "horizontal" ? "h-px w-full" : "h-6 w-px",
        className,
      )}
      {...props}
    />
  );
});
