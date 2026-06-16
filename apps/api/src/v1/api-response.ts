// api-response.ts (API-02) — enveloppe standard { success, data, error, meta } pour /api/v1/*.
//
// Helpers utilisés par tous les controllers v1 :
//   - ok(data)           → réponse réussie simple (GET detail / POST)
//   - paginated(...)     → réponse listée avec pagination meta
//
// T-5-v1-enum : les erreurs passent par V1ExceptionFilter (jamais ici) — pas de fuite de stack.

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta?: { total: number; page: number; limit: number };
}

/** Réponse succès simple (detail, create). */
export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

/** Réponse listée paginée avec meta. */
export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): ApiResponse<T[]> {
  return { success: true, data, meta: { total, page, limit } };
}
