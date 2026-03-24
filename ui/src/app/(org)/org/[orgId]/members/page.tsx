import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/server-auth"
import { serverFetch } from "@/lib/server-api"
import { MembersClient } from "./members-client"

interface Member {
  user_id: string
  display_name: string
  email: string
  role: "admin" | "moderator"
  joined_at: string
}

interface Props {
  params: Promise<{ orgId: string }>
}

export default async function MembersPage({ params }: Props) {
  const { orgId } = await params
  const session = await getServerSession()
  if (!session) redirect("/login")

  // Server-side role guard: check if current user is admin
  const members = await serverFetch<Member[]>(`/orgs/${orgId}/members`)
  if (!members) redirect("/org/dashboard")

  const currentMember = members.find((m) => m.user_id === session.user.id)
  if (!currentMember || currentMember.role !== "admin") {
    // Moderators get a 403 page — not just a redirect
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
        <h2 className="text-lg font-semibold text-destructive mb-2">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          Admin access required to manage members.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
      </div>
      <MembersClient members={members} orgId={orgId} currentUserId={session.user.id} />
    </div>
  )
}
