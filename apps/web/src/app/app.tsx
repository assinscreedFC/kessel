import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell, WideAppShell } from "@/widgets/app-shell/ui/app-shell";
import { ContactsPage } from "@/pages/contacts/ui/contacts-page";
import { ContactDetailPage } from "@/pages/contacts/ui/contact-detail-page";
import { DealsPage } from "@/pages/deals/ui/deals-page";
import { PricingPage } from "@/pages/pricing/ui/pricing-page";
import { TemplatesPage } from "@/pages/templates/ui/templates-page";
import { ProposalsPage } from "@/pages/proposals/ui/proposals-page";
import { DatasetPage } from "@/pages/dataset/ui/dataset-page";
import { ProposalEditorPage } from "@/pages/proposal-editor/ui/proposal-editor-page";
import { TemplateEditorPage } from "@/pages/proposal-editor/ui/template-editor-page";
import { PublicProposalPage } from "@/pages/public-proposal/ui/public-proposal-page";
import { PublicPaymentPage } from "@/pages/public-payment/ui/public-payment-page";
import { ProjectsPage } from "@/pages/projects/ui/projects-page";
import { ProjectDetailPage } from "@/pages/project-detail/ui/project-detail-page";
import { PipelinePage } from "@/pages/pipeline/ui/pipeline-page";
import { OrganisationsPage } from "@/pages/organisations/ui/organisations-page";
import { OrganisationDetailPage } from "@/pages/organisations/ui/organisation-detail-page";
import { SettingsApiPage } from "@/pages/settings-api/ui/settings-api-page";
import { Toaster } from "@/shared/ui/sonner";

// App shell (couche `app` de la FSD). Câble UNE SEULE FOIS la couche data : QueryClientProvider
// (cache server-state TanStack), BrowserRouter + routes dans le layout AppShell, et le Toaster sonner.
// Les pages métier vivent dans la couche `pages`.

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
            <Route path="/contacts/:id" element={<ContactDetailPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/proposals" element={<ProposalsPage />} />
            <Route path="/dataset" element={<DatasetPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/organisations" element={<OrganisationsPage />} />
            <Route path="/organisations/:id" element={<OrganisationDetailPage />} />
            <Route path="/settings/api" element={<SettingsApiPage />} />
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
          {/* Page de paiement publique tokenisée (PAY-02) — hors AppShell, cookie-less, T-3-web-iso. */}
          <Route path="/pay/:token" element={<PublicPaymentPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
