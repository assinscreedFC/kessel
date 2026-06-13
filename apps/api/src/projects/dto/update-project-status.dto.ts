import { IsEnum } from "class-validator";
import { ProjectStatus, type UpdateProjectStatusInput } from "@kessel/shared";

// DTO PATCH /api/projects/:id — transition de statut (PROJ-05, T-2-transition, T-2-input).
// @IsEnum(ProjectStatus) : ValidationPipe global rejette toute valeur hors {ACTIVE,COMPLETED,CANCELLED}
// avec un 400 AVANT d'atteindre le service (T-2-input).
// La garde de transition (ACTIVE → COMPLETED|CANCELLED uniquement) reste dans ProjectsService
// car elle nécessite l'état courant en DB (T-2-transition).
export class UpdateProjectStatusDto implements UpdateProjectStatusInput {
  @IsEnum(ProjectStatus)
  status!: ProjectStatus;
}
