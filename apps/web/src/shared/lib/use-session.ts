import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession, signOut } from "./auth";
import type { SessionData } from "./auth";

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSession() {
  return useQuery<SessionData | null>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: getSession,
    staleTime: 5 * 60 * 1000, // 5 min — évite les re-fetch constants
    retry: false,
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await signOut();
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
    queryClient.clear();
  };
}
