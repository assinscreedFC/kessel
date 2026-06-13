import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/shared/lib/utils";

// DropdownMenu — port shadcn manuel (wrap @radix-ui/react-dropdown-menu). Menu d'actions de ligne
// (02-UI-SPEC : MoreHorizontal -> Renommer / Supprimer). Densité slate, items h-9. Radix gère
// focus/clavier/portal ; on ne re-câble que le style.

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[10rem] overflow-hidden rounded-md border border-slate-200 bg-white p-1 shadow-md",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    destructive?: boolean;
  }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex h-9 cursor-pointer select-none items-center gap-2 rounded-md px-3 text-sm outline-none",
        "focus:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive ? "text-red-600 focus:bg-red-50" : "text-slate-900",
        className,
      )}
      {...props}
    />
  );
});
