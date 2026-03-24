import { cookies } from "next/headers"
import type { AuthUser } from "@/lib/auth"

export async function getServerSession(): Promise<{ user: AuthUser } | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("bounty_session")
  if (!token?.value) return null

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/identity/me`,
      {
        headers: { Cookie: `bounty_session=${token.value}` },
        cache: "no-store",
      },
    )
    if (!res.ok) return null
    const user: AuthUser = await res.json()
    return { user }
  } catch {
    return null
  }
}
