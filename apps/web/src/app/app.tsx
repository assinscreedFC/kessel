import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell, WideAppShell } from "@/widgets/app-shell/ui/app-shell";
import { ContactsPage } from "@/pages/contacts/ui/contacts-page";
import { DealsPage } from "@/pages/deals/ui/deals-page";
import { PricingPage } from "@/pages/pricing/ui/pricing-page";
import { TemplatesPage } from "@/pages/templates/ui/templates-page";
import { ProposalsPage } from "@/pages/proposals/ui/proposals-page";
import { ProposalEditorPage } from "@/pages/proposal-editor/ui/proposal-editor-page";
import { TemplateEditorPage } from "@/pages/proposal-editor/ui/template-editor-page";
import { PublicProposalPage } from "@/pages/public-proposal/ui/public-proposal-page";
import { Toaster } from "@/shared/ui/sonner";

// App shell (couche `app` de la FSD). Câble UNE SEULE FOIS la couche data : QueryClientProvider
// (cache server-state TanStack), BrowserRouter + 2 routes (Contacts `/`, Deals `/deals`) dans le
// layout AppShell, et le Toaster sonner. Les pages métier vivent dans la couche `pages`.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ContactsPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/proposals" element={<ProposalsPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
          </Route>
          {/* Éditeur pleine largeur (échappe au cap max-w-6xl) : proposition + template. */}
          <Route element={<WideAppShell />}>
            <Route path="/proposals/:id" element={<ProposalEditorPage />} />
            <Route
              path="/proposals/templates/:id/edit"
              element={<TemplateEditorPage />}
            />
          </Route>
          {/* Surface PUBLIQUE client (DELIV-01/02/03) : ISOLÉE du dashboard authentifié — montée HORS
              de tout layout AppShell/WideAppShell (aucune sidebar/chrome, aucune session). Le token
              dans l'URL est le secret d'accès ; le client public (publicApi) n'envoie jamais de cookie. */}
          <Route path="/p/:token" element={<PublicProposalPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
