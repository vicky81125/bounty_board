export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(`API error ${status}`)
  }
}

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null
  return (
    document.cookie
      .split(";")
      .map((c) => c.trim().split("="))
      .find(([k]) => k === "csrf_token")?.[1] ?? null
  )
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)

  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  const method = (init.method ?? "GET").toUpperCase()
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCsrfToken()
    if (csrf) headers.set("X-CSRF-Token", csrf)
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  })

  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => ({})))
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

// Auth API helpers
export const authApi = {
  register: (body: Record<string, unknown>) =>
    apiRequest("/identity/register", { method: "POST", body: JSON.stringify(body) }),

  login: (email: string, password: string) =>
    apiRequest("/identity/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: () => apiRequest("/identity/logout", { method: "POST" }),

  session: () => apiRequest("/identity/session"),

  checkUsername: (username: string) =>
    apiRequest<{ available: boolean }>(`/identity/check-username?username=${encodeURIComponent(username)}`),
}
