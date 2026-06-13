import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/shared/lib/utils";

// Label — port shadcn manuel (wrap @radix-ui/react-label). Rôle "Label" 02-UI-SPEC :
// text-sm font-semibold. Le `mb-1.5` qui sépare du champ est appliqué par l'appelant (Dialog).
export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        "text-sm font-semibold text-slate-900 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
});
