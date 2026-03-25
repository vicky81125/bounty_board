import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = createAdminClient()

  // Get current user's membership
  const { data: myMembership } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single()

  if (!myMembership) redirect("/org/dashboard")

  if (myMembership.role !== "admin") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
        <h2 className="text-lg font-semibold text-destructive mb-2">Access Denied</h2>
        <p className="text-sm text-muted-foreground">
          Admin access required to manage members.
        </p>
      </div>
    )
  }

  // Fetch all members with profile info
  const { data: rows } = await admin
    .from("org_members")
    .select("user_id, role, created_at, profiles!inner(display_name, email)")
    .eq("org_id", orgId)
    .order("created_at")

  const members: Member[] = (rows ?? []).map((r: any) => ({
    user_id: r.user_id,
    display_name: r.profiles?.display_name ?? "",
    email: r.profiles?.email ?? "",
    role: r.role,
    joined_at: r.created_at,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
      </div>
      <MembersClient members={members} orgId={orgId} currentUserId={user.id} />
    </div>
  )
}
