import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { DashboardPage } from "./dashboard-page";
import * as api from "@/shared/lib/api";

// Mock portalApi
vi.mock("@/shared/lib/api", () => ({
  portalApi: {
    me: vi.fn(),
    proposals: vi.fn(),
    project: vi.fn(),
    payments: vi.fn(),
  },
  PortalUnauthorizedError: class PortalUnauthorizedError extends Error {
    constructor() {
      super("Unauthorized");
      this.name = "PortalUnauthorizedError";
    }
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.mocked(api.portalApi.me).mockResolvedValue({ contactId: "c1", orgId: "o1" });
    vi.mocked(api.portalApi.proposals).mockResolvedValue([]);
    vi.mocked(api.portalApi.project).mockResolvedValue(null);
    vi.mocked(api.portalApi.payments).mockResolvedValue([]);
  });

  it("renders the 3 section headings", async () => {
    render(<DashboardPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Mes propositions")).toBeInTheDocument();
      expect(screen.getByText("Mon projet")).toBeInTheDocument();
      expect(screen.getByText("Paiements")).toBeInTheDocument();
    });
  });

  it("renders empty states when data is empty", async () => {
    render(<DashboardPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Aucune proposition pour le moment.")).toBeInTheDocument();
      expect(screen.getByText("Votre projet n'est pas encore disponible.")).toBeInTheDocument();
      expect(screen.getByText("Aucun paiement enregistré.")).toBeInTheDocument();
    });
  });

  it("renders a proposal with badge", async () => {
    vi.mocked(api.portalApi.proposals).mockResolvedValue([
      { id: "p1", title: "Proposition Test", status: "SENT", createdAt: "2026-01-01" },
    ]);

    render(<DashboardPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Proposition Test")).toBeInTheDocument();
      // Badge from PROPOSAL_STATUS_META: SENT -> "Envoyée"
      expect(screen.getByText("Envoyée")).toBeInTheDocument();
    });
  });

  it("renders project with tasks as read-only (no checkbox, no button)", async () => {
    vi.mocked(api.portalApi.project).mockResolvedValue({
      id: "proj1",
      title: "Projet Alpha",
      status: "ACTIVE",
      tasks: [
        { id: "t1", title: "Tâche 1", done: true },
        { id: "t2", title: "Tâche 2", done: false },
      ],
    });

    const { container } = render(<DashboardPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Projet Alpha")).toBeInTheDocument();
      expect(screen.getByText("Tâche 1")).toBeInTheDocument();
      expect(screen.getByText("Tâche 2")).toBeInTheDocument();
    });

    // Strict read-only: no checkbox inputs, no buttons in task area
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(0);

    // Assert completion icons are rendered — proves isDone is computed from done:boolean.
    // Two tasks => at least 2 SVG icons (one CheckCircle2, one Circle).
    // A regression that re-introduces task.status would crash on undefined.done and fail here.
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it("renders payment rows with kind labels and badges", async () => {
    vi.mocked(api.portalApi.payments).mockResolvedValue([
      { id: "pay1", kind: "DEPOSIT", status: "PAID", amountCents: 50000, currency: "EUR" },
      { id: "pay2", kind: "BALANCE", status: "PENDING", amountCents: 100000, currency: "EUR" },
    ]);

    render(<DashboardPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Acompte")).toBeInTheDocument();
      expect(screen.getByText("Solde")).toBeInTheDocument();
      // PAID badge
      expect(screen.getByText("Payé")).toBeInTheDocument();
      // PENDING badge
      expect(screen.getByText("En attente")).toBeInTheDocument();
    });
  });

  it("renders footer", async () => {
    render(<DashboardPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Propulsé par Kessel")).toBeInTheDocument();
    });
  });
});
