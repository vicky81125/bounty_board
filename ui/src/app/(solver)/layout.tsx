import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getServerSession } from "@/lib/server-auth"
import { SolverShell } from "@/components/layout/solver-shell"

// Paths under (solver)/ that participants can access but organizers cannot
const PARTICIPANT_ONLY_PREFIXES = ["/dashboard"]

function isParticipantOnlyPath(pathname: string): boolean {
  if (PARTICIPANT_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) return true
  // /bounties/[id]/submit and /bounties/[id]/my-submission are participant-only
  if (pathname.includes("/submit") || pathname.includes("/my-submission")) return true
  return false
}

export default async function SolverLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect("/login")

  if (session.user.account_type === "organizer") {
    const headersList = await headers()
    const pathname = headersList.get("x-pathname") ?? "/"
    if (isParticipantOnlyPath(pathname)) {
      redirect("/org/dashboard")
    }
  }

  return <SolverShell user={session.user}>{children}</SolverShell>
}
