import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";

// Shell portail client — QueryClient + BrowserRouter.
// Routes placeholder : les pages réelles sont créées en Plan 04.
const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<div>Portail Kessel</div>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
