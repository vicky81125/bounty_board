/**
 * Server-side API helper — runs only in RSC / layout server components.
 * Forwards the session cookie from the incoming request to the backend.
 */
import { cookies } from "next/headers"

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api"

export async function serverFetch<T>(
  path: string,
  options: { noCache?: boolean } = {}
): Promise<T | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get("bounty_session")
  if (!sessionCookie?.value) return null

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Cookie: `bounty_session=${sessionCookie.value}` },
      // Default: 10s revalidation — fast enough for real-time feel, eliminates
      // redundant fetches on quick back/forward navigation.
      // Pass { noCache: true } for data that must always be fresh (e.g. auth checks).
      ...(options.noCache
        ? { cache: "no-store" }
        : { next: { revalidate: 10 } }),
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}
