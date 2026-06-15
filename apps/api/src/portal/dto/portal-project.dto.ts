// PortalProjectDto + PortalTaskDto — réponse minimale pour GET /portal/project (PORT-03).
// SÉCURITÉ (T-4-leak) : JAMAIS orgId/dealId/proposalId exposés.
// Lecture seule — aucune action de mutation portail.
export type PortalTaskDto = {
  id: string;
  title: string;
  done: boolean;
};

export type PortalProjectDto = {
  id: string;
  title: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  tasks: PortalTaskDto[];
} | null;
