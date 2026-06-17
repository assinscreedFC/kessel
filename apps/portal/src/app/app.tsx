import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { isValidBrandColor, DEFAULT_BRAND_COLOR } from "@kessel/shared";
import { MagicLinkPage } from "@/pages/magic-link/ui/magic-link-page";
import { DashboardPage } from "@/pages/dashboard/ui/dashboard-page";
import { Error401Page } from "@/pages/error-401/ui/error-401-page";
import { portalApi } from "@/shared/lib/api";

// Shell portail client — QueryClient + BrowserRouter.
// Routes : / → magic-link exchange, /dashboard → dashboard 3 sections, * → 401 uniforme.
// PORT-07 : injection CSS var --brand-color + header logo depuis GET /portal/branding.

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

// Hook branding : échoue silencieusement sur 401 (pas de JWT avant l'échange de magic-link).
// Pas de branding = fallback CSS DEFAULT_BRAND_COLOR.
function useBranding() {
  const query = useQuery({
    queryKey: ["portal-branding"],
    queryFn: portalApi.branding,
    retry: false,
  });

  return query.data ?? null;
}

function BrandedShell({ children }: { children: React.ReactNode }) {
  const branding = useBranding();

  // Re-validation côté portail avant injection <style> (Pitfall 5 T-8-css).
  const safeColor =
    branding?.brandColor && isValidBrandColor(branding.brandColor)
      ? branding.brandColor
      : null;

  return (
    <>
      {/* Injection CSS var --brand-color uniquement si hex validé (anti CSS injection). */}
      {safeColor && (
        <style>{`:root { --brand-color: ${safeColor}; }`}</style>
      )}
      {/* Header logo : affiché uniquement si logo URL défini (pas de header si pas de logo). */}
      {branding?.logo && (
        <header
          className="h-14 flex items-center px-4"
          style={{ backgroundColor: `var(--brand-color, ${DEFAULT_BRAND_COLOR})` }}
        >
          <img
            src={branding.logo}
            alt={branding.orgName}
            className="h-8 object-contain max-w-[160px]"
          />
        </header>
      )}
      {children}
    </>
  );
}

function AppRoutes() {
  return (
    <BrandedShell>
      <Routes>
        <Route path="/" element={<MagicLinkPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<Error401Page />} />
      </Routes>
    </BrandedShell>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
