import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/shared/lib/utils";

// Tabs — port shadcn manuel (wrap @radix-ui/react-tabs). Style segmented control 02-UI-SPEC :
// piste bg-slate-100 rounded-lg p-1 ; chaque trigger px-3 h-8 rounded-md ; actif bg-white shadow-sm
// font-semibold, inactif text-slate-600. NEUTRE (aucune hue) — ne concurrence pas les badges statut.
// Utilisé comme filtre statut au-dessus de la table Deals (CRM-03).

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn("inline-flex items-center rounded-lg bg-slate-100 p-1", className)}
      {...props}
    />
  );
});

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm text-slate-600",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-slate-900 data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
});
