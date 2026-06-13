import { z } from "zod";
import { PROJECT_STATUS_VALUES, type ProjectDto, type ProjectStatus, type TaskDto } from "@kessel/shared";

// Modèle de l'entité Project côté web (couche `entities`).
//
// Le TYPE vient du contrat partagé @kessel/shared (source de vérité unique — anti-drift front/back).
// `Project` est un alias de `ProjectDto`. Le SCHÉMA de validation est un miroir zod de
// `UpdateProjectStatusInput` (le web utilise zod, jamais class-validator). Validation web = UX +
// défense en profondeur ; la frontière d'autorité reste le DTO serveur (T-2-input).

export type Project = ProjectDto;
export type Task = TaskDto;
export { PROJECT_STATUS_VALUES, type ProjectStatus };

// projectStatusFormSchema : miroir du contrat serveur UpdateProjectStatusInput.
// Valide les 3 valeurs de l'enum ProjectStatus — rejette tout autre statut (ex: "ARCHIVED", "").
export const projectStatusFormSchema = z.object({
  status: z.enum(PROJECT_STATUS_VALUES as [ProjectStatus, ...ProjectStatus[]]),
});

export type ProjectStatusFormValues = z.output<typeof projectStatusFormSchema>;
