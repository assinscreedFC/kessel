// portalApi — client fetch portail (JWT cookie httpOnly).
// Toutes les requêtes utilisent credentials:"include" pour envoyer le cookie portal_session.
// Proxy /portal → localhost:3000 configuré dans apps/portal/vite.config.ts (Plan 01).

// ---- DTOs (miroir des DTOs Plan 03 côté API) ----

export type PortalProposalDto = {
  id: string;
  title: string;
  status: "DRAFT" | "SENT" | "SIGNED";
  createdAt: string;
};

export type PortalTaskDto = {
  id: string;
  title: string;
  status: string; // DONE/COMPLETED triggers CheckCircle2
};

export type PortalProjectDto = {
  id: string;
  name: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  tasks: PortalTaskDto[];
};

export type PortalPaymentDto = {
  id: string;
  kind: "DEPOSIT" | "BALANCE";
  status: "PENDING" | "PAID" | "FAILED";
  amountCents: number;
  currency: string;
};

export type PortalMeDto = {
  contactId: string;
  orgId: string;
};

// ---- Error types ----

export class PortalUnauthorizedError extends Error {
  constructor() {
    super("Portal session unauthorized");
    this.name = "PortalUnauthorizedError";
  }
}

// ---- Fetch helper ----

async function portalFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (res.status === 401) throw new PortalUnauthorizedError();
  if (!res.ok) throw new Error(`Portal API ${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

// ---- Public API ----

export const portalApi = {
  me: () => portalFetch<PortalMeDto>("/portal/me"),
  proposals: () => portalFetch<PortalProposalDto[]>("/portal/proposals"),
  project: () => portalFetch<PortalProjectDto | null>("/portal/project"),
  payments: () => portalFetch<PortalPaymentDto[]>("/portal/payments"),
  exchange: (token: string) =>
    fetch("/portal/auth/exchange", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }),
};
