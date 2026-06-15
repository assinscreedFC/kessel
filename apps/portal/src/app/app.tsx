import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MagicLinkPage } from "@/pages/magic-link/ui/magic-link-page";
import { DashboardPage } from "@/pages/dashboard/ui/dashboard-page";
import { Error401Page } from "@/pages/error-401/ui/error-401-page";

// Shell portail client — QueryClient + BrowserRouter.
// Routes : / → magic-link exchange, /dashboard → dashboard 3 sections, * → 401 uniforme.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MagicLinkPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<Error401Page />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
