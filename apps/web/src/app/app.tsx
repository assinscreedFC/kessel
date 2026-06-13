import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/widgets/app-shell/ui/app-shell";
import { ContactsPage } from "@/pages/contacts/ui/contacts-page";
import { Toaster } from "@/shared/ui/sonner";

// App shell (couche `app` de la FSD). Câble UNE SEULE FOIS la couche data : QueryClientProvider
// (cache server-state TanStack), BrowserRouter + 2 routes (Contacts `/`, Deals `/deals`) dans le
// layout AppShell, et le Toaster sonner. Les pages métier vivent dans la couche `pages`.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

// Placeholder Deals — remplacé par la vraie page au Plan 04.
function DealsPlaceholder() {
  return (
    <div className="text-sm text-slate-500">
      La page Deals arrive au prochain plan.
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ContactsPage />} />
            <Route path="/deals" element={<DealsPlaceholder />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </QueryClientProvider>
  );
}
