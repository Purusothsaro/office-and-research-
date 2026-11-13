/** Sign-in calls to the OctoGenie Research server. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export class SessionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

const HEADERS = { "X-Octo-Client": "web" };

async function authCall(path: string, body?: unknown): Promise<SessionUser> {
  const res = await fetch(`/api/auth/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: { ...HEADERS, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: SessionUser; error?: string };
  // 502/503/504 without our JSON means the dev proxy couldn't reach the API server.
  if (!data.error && [502, 503, 504].includes(res.status)) throw new SessionError(res.status, "Can't reach the OctoGenie Research server. Make sure it's running (npm run dev starts it) and MongoDB is available.");
  if (!res.ok || !data.user) throw new SessionError(res.status, data.error ?? "Something went wrong.");
  return data.user;
}

export const session = {
  me: () => authCall("me"),
  login: (email: string, password: string) => authCall("login", { email, password }),
  register: (email: string, password: string, name: string) => authCall("register", { email, password, name }),
  logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: HEADERS }).then(() => undefined),
};
