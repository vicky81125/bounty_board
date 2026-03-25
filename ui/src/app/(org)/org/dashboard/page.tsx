import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { OrgShell } from "@/components/layout/org-shell"
import type { AuthUser } from "@/lib/auth"
import Link from "next/link"

export default async function OrgDashboardPage() {
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

  // Find orgs the user administers
  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)

  if (memberships && memberships.length > 0) {
    redirect(`/org/${memberships[0].org_id}/dashboard`)
  }

  return (
    <OrgShell user={authUser}>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Organizer Dashboard</h1>
        <p className="text-muted-foreground">
          Create and manage your organisation to start posting bounties.
        </p>
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground mb-4">
            You haven&apos;t created an organisation yet.
          </p>
          <Link
            href="/org/new"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Create your first organisation
          </Link>
        </div>
      </div>
    </OrgShell>
  )
}
