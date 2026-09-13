/** Typed fetch wrapper for the backend API. Cookie-session auth, JSON in/out. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Opts = {
  method?: string;
  /** Sent as JSON body. */
  body?: unknown;
  /** Sent as multipart/form-data (e.g. receipt upload). */
  form?: FormData;
};

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const { method = opts.body ? "POST" : "GET", body, form } = opts;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: form ? undefined : body ? { "Content-Type": "application/json" } : undefined,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) message = data.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type User = { id: number; email: string; name: string };

/** Current session; null when logged out (401). */
export async function getMe(): Promise<User | null> {
  try {
    return await api<User>("/users/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}
