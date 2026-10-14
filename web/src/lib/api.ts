import type {
  DocumentList,
  DocumentStatus,
  Draft,
  Finalization,
  Issuer,
  PublicDocument,
  Session,
  StudioDocument,
  StudioIssuer,
  VerifyResult,
} from "./types";

/** An error response from the API, carrying its machine-readable code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;

  constructor(status: number, code: string, message: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network", "Could not reach the server. Check your connection and try again.");
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; field?: string } } | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "http_" + res.status,
      err?.message ?? `The server answered ${res.status}.`,
      err?.field,
    );
  }
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  issuer: () => request<Issuer>("GET", "/api/issuer"),
  document: (id: string) => request<PublicDocument>("GET", `/api/documents/${enc(id)}`),
  verify: (id: string, sha512: string) => request<VerifyResult>("POST", `/api/documents/${enc(id)}/verify`, { sha512 }),
  lookup: (sha512: string) => request<PublicDocument>("POST", "/api/lookup", { sha512 }),

  session: () => request<Session>("GET", "/api/auth/session"),
  login: (password: string) => request<Session>("POST", "/api/auth/login", { password }),
  logout: () => request<Session>("POST", "/api/auth/logout", {}),

  studio: {
    list: (params: { status?: DocumentStatus; q?: string; before?: string; limit?: number }) => {
      const search = new URLSearchParams();
      if (params.status) search.set("status", params.status);
      if (params.q) search.set("q", params.q);
      if (params.before) search.set("before", params.before);
      if (params.limit) search.set("limit", String(params.limit));
      const qs = search.toString();
      return request<DocumentList>("GET", "/api/studio/documents" + (qs ? "?" + qs : ""));
    },
    create: (draft: Draft) => request<StudioDocument>("POST", "/api/studio/documents", draft),
    finalize: (id: string, f: Finalization) => request<StudioDocument>("POST", `/api/studio/documents/${enc(id)}/finalize`, f),
    revoke: (id: string, reason: string) => request<StudioDocument>("POST", `/api/studio/documents/${enc(id)}/revoke`, { reason }),
    discard: (id: string) => request<void>("DELETE", `/api/studio/documents/${enc(id)}`),
    issuer: () => request<StudioIssuer>("GET", "/api/studio/issuer"),
    saveIssuer: (issuer: Issuer) => request<StudioIssuer>("PUT", "/api/studio/issuer", issuer),
  },
};
