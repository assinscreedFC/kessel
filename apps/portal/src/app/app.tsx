import { useEffect } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import { MagicLinkPage } from "@/pages/magic-link/ui/magic-link-page";
import { DashboardPage } from "@/pages/dashboard/ui/dashboard-page";
import { Error401Page } from "@/pages/error-401/ui/error-401-page";
import { portalApi, PortalUnauthorizedError } from "@/shared/lib/api";

// Shell portail client — QueryClient + BrowserRouter.
// Routes : / → magic-link exchange, /dashboard → dashboard 3 sections, * → 401 uniforme.
// PORT-07 : injection CSS var --brand-color + header logo depuis GET /portal/branding.

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

// Regex hex locale — re-validation AVANT injection <style> (Pitfall 5 CSS injection T-8-css).
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Hook branding : ne redirige PAS sur 401 (la page d'échange de token n'a pas encore de JWT).
// Silencieux en cas d'erreur (pas de branding = fallback CSS #4F46E5).
function useBranding() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["portal-branding"],
    queryFn: portalApi.branding,
    retry: false,
  });

  useEffect(() => {
    // 401 sur /portal/branding = JWT absent/expiré → rediriger vers / uniquement si pas déjà sur /.
    if (query.error instanceof PortalUnauthorizedError) {
      // Ne pas rediriger — le magic-link exchange se charge de l'auth initiale.
      // Le branding échouera silencieusement jusqu'à obtention du JWT.
    }
  }, [query.error, navigate]);

  return query.data ?? null;
}

function BrandedShell({ children }: { children: React.ReactNode }) {
  const branding = useBranding();

  // Re-validation regex côté portail avant injection <style> (Pitfall 5 T-8-css).
  const safeColor =
    branding?.brandColor && HEX_COLOR_RE.test(branding.brandColor)
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
          style={{ backgroundColor: "var(--brand-color, #4F46E5)" }}
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
