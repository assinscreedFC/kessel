import { IsBoolean } from "class-validator";
import type { UpdateTaskInput } from "@kessel/shared";

// DTO PATCH /api/tasks/:id — cocher/décocher une tâche (PROJ-05, T-2-input).
// @IsBoolean() : ValidationPipe global rejette toute valeur non-booléenne avec un 400 (T-2-input).
// La garde projet ACTIVE + l'isolation org via parent sont dans ProjectsService (T-2-status-task).
export class UpdateTaskDto implements UpdateTaskInput {
  @IsBoolean()
  done!: boolean;
}
