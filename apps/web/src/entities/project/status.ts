import { type ProjectStatus } from "@kessel/shared";

// PROJECT_STATUS_META — SOURCE UNIQUE du mapping statut -> (label FR + classes badge), 02-UI-SPEC §Color.
// Réutilisé partout : badge de la table projets, badge du détail, ProjectStatusControl.
// Les classes `badge` sont la SEULE introduction de hue du design (tout le reste est slate).
// Transitions : ACTIVE→COMPLETED|CANCELLED seulement, sans retour arrière (CONTEXT.md).
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; badge: string }> = {
  ACTIVE: { label: "Actif", badge: "bg-blue-100 text-blue-700" },
  COMPLETED: { label: "Terminé", badge: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Annulé", badge: "bg-red-100 text-red-700" },
};
