import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { SolverShell } from "@/components/layout/solver-shell"
import type { AuthUser } from "@/lib/auth"

// Paths under (solver)/ that participants can access but organizers cannot
const PARTICIPANT_ONLY_PREFIXES = ["/dashboard"]

function isParticipantOnlyPath(pathname: string): boolean {
  if (PARTICIPANT_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) return true
  // /bounties/[id]/submit and /bounties/[id]/my-submission are participant-only
  if (pathname.includes("/submit") || pathname.includes("/my-submission")) return true
  return false
}

export default async function SolverLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, account_type, avatar_url")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? "",
    username: profile.username,
    display_name: profile.display_name,
    account_type: profile.account_type,
    avatar_url: profile.avatar_url ?? null,
  }

  if (authUser.account_type === "organizer") {
    const headersList = await headers()
    const pathname = headersList.get("x-pathname") ?? "/"
    if (isParticipantOnlyPath(pathname)) {
      redirect("/org/dashboard")
    }
  }

  return <SolverShell user={authUser}>{children}</SolverShell>
}
