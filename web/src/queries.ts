import { QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "./lib/api";
import type { DocumentStatus, Issuer, StudioDocument } from "./lib/types";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors are answers, not outages: do not retry them.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

export const keys = {
  issuer: ["issuer"] as const,
  document: (id: string) => ["document", id] as const,
  session: ["session"] as const,
  studioDocuments: ["studio", "documents"] as const,
  studioList: (status: DocumentStatus | undefined, q: string) => ["studio", "documents", status ?? "all", q] as const,
  studioIssuer: ["studio", "issuer"] as const,
};

export function useIssuer() {
  return useQuery({ queryKey: keys.issuer, queryFn: api.issuer, staleTime: 5 * 60_000 });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: keys.document(id ?? ""),
    queryFn: () => api.document(id!),
    enabled: id !== null,
  });
}

export function useVerify(id: string) {
  return useMutation({ mutationFn: (sha512: string) => api.verify(id, sha512) });
}

export function useLookup() {
  return useMutation({ mutationFn: api.lookup });
}

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: api.session, staleTime: 60_000 });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.login,
    onSuccess: (session) => qc.setQueryData(keys.session, session),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      qc.removeQueries({ queryKey: ["studio"] });
      return qc.invalidateQueries({ queryKey: keys.session });
    },
  });
}

const PAGE_SIZE = 50;

export function useStudioDocuments(status: DocumentStatus | undefined, q: string) {
  return useInfiniteQuery({
    queryKey: keys.studioList(status, q),
    queryFn: ({ pageParam }) => api.studio.list({ status, q, before: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (previous) => previous,
  });
}

function useDocumentMutation<V>(mutationFn: (vars: V) => Promise<StudioDocument | void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.studioDocuments });
      qc.invalidateQueries({ queryKey: ["document"] });
    },
  });
}

export function useRevoke() {
  return useDocumentMutation(({ id, reason }: { id: string; reason: string }) => api.studio.revoke(id, reason));
}

export function useDiscard() {
  return useDocumentMutation((id: string) => api.studio.discard(id));
}

export function useStudioIssuer() {
  return useQuery({ queryKey: keys.studioIssuer, queryFn: api.studio.issuer });
}

export function useSaveIssuer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (issuer: Issuer) => api.studio.saveIssuer(issuer),
    onSuccess: (saved) => {
      qc.setQueryData(keys.studioIssuer, saved);
      qc.invalidateQueries({ queryKey: keys.issuer });
    },
  });
}
