import { Button } from "@/shared/ui/button";

// App shell (couche `app` de la Feature-Sliced Design). Dashboard placeholder Phase 1 :
// AUCUNE feature métier (ni CRM, ni propositions) — juste le squelette FSD + une preuve
// de câblage shadcn/ui (Button) et Tailwind. Les features métier arrivent aux phases suivantes.
export function App() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-50 text-slate-900">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-4xl font-bold tracking-tight">Kessel — Foundations</h1>
        <p className="text-slate-500">
          Scaffold web (React + Vite + Feature-Sliced Design + shadcn/ui)
        </p>
      </div>
      <Button>Foundations OK</Button>
    </main>
  );
}
