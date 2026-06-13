import { Toaster as SonnerToaster } from "sonner";

// Sonner — port shadcn manuel (toasts). 02-UI-SPEC : bottom-right, auto-dismiss 4s, dismissible.
// `toast` est ré-exporté pour les appels succès/erreur depuis les mutations TanStack.
export { toast } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast: "bg-white border border-slate-200 text-slate-900 text-sm",
          success: "[&_svg]:text-green-600",
          error: "[&_svg]:text-red-600",
        },
      }}
    />
  );
}
