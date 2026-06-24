import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { signIn, signUp } from "@/shared/lib/auth";
import { SESSION_QUERY_KEY } from "@/shared/lib/use-session";
import { Button } from "@/shared/ui/button";

// Page login/signup — hors AppShell (pas de sidebar, pas de session requise).
// Deux modes : "login" et "signup" basculés via un onglet.
// Après auth, invalide le cache session → redirect vers /.

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        await signUp(email, password, name || email.split("@")[0]);
        await signIn(email, password);
      }
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Kessel</h1>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "login" ? "Connectez-vous à votre espace." : "Créez votre compte."}
          </p>
        </div>

        <div className="mb-6 flex rounded-md border border-slate-200 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded py-1.5 text-sm font-medium transition-colors ${
              mode === "login"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded py-1.5 text-sm font-medium transition-colors ${
              mode === "signup"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Créer un compte
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-700">Nom</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Dupont"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              required
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-700">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={8}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

          <Button type="submit" className="mt-1 w-full" disabled={loading}>
            {loading ? "..." : mode === "login" ? "Se connecter" : "Créer le compte"}
          </Button>
        </form>
      </div>
    </div>
  );
}
