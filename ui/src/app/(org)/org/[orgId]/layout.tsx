import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { OrgShell } from "@/components/layout/org-shell"
import type { AuthUser } from "@/lib/auth"

interface Props {
  children: React.ReactNode
  params: Promise<{ orgId: string }>
}

export default async function OrgIdLayout({ children, params }: Props) {
  const { orgId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, account_type, avatar_url")
    .eq("id", user.id)
    .single()

  if (!profile || profile.account_type === "participant") redirect("/dashboard")

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .single()

  if (!membership) redirect("/org/dashboard")

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? "",
    username: profile.username,
    display_name: profile.display_name,
    account_type: profile.account_type,
    avatar_url: profile.avatar_url ?? null,
  }

  const orgRole = membership.role as "admin" | "moderator"

  return (
    <OrgShell user={authUser} orgId={orgId} orgRole={orgRole}>
      {children}
    </OrgShell>
  )
}
