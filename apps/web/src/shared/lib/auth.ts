// Client auth minimal — Better Auth HTTP endpoints via le proxy Vite /api.
// Pas de better-auth/client installé côté web : appels fetch directs sur les endpoints standard.
// Credentials "include" → cookie httpOnly de session envoyé automatiquement.

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: string;
}

export interface SessionData {
  session: Session;
  user: SessionUser;
}

export async function getSession(): Promise<SessionData | null> {
  const res = await fetch("/api/auth/get-session", {
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.session) return null;
  return data as SessionData;
}

export async function signIn(email: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/sign-in/email", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Erreur ${res.status}`);
  }
}

export async function signUp(
  email: string,
  password: string,
  name: string,
): Promise<void> {
  const res = await fetch("/api/auth/sign-up/email", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Erreur ${res.status}`);
  }
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
  });
}
