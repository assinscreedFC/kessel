// PortalProposalDto — réponse minimale pour GET /portal/proposals (PORT-02).
// SÉCURITÉ (T-4-leak) : JAMAIS orgId/dealId exposés — seules les infos utiles au contact.
export type PortalProposalDto = {
  id: string;
  title: string;
  status: "DRAFT" | "SENT" | "SIGNED";
  createdAt: string;
};
