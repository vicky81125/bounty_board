import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/server-auth"
import { serverFetch } from "@/lib/server-api"
import { OrgShell } from "@/components/layout/org-shell"

interface Props {
  children: React.ReactNode
  params: Promise<{ orgId: string }>
}

export default async function OrgIdLayout({ children, params }: Props) {
  const { orgId } = await params
  const session = await getServerSession()
  if (!session) redirect("/login")
  if (session.user.account_type === "participant") redirect("/dashboard")

  // Verify user is a member of this org and get their role.
  // Uses /members/me to fetch only the current user's membership (not all members).
  const membership = await serverFetch<{ user_id: string; role: string }>(
    `/orgs/${orgId}/members/me`,
    { noCache: true }
  )
  if (!membership) redirect("/org/dashboard")

  const orgRole = membership.role as "admin" | "moderator"

  return (
    <OrgShell user={session.user} orgId={orgId} orgRole={orgRole}>
      {children}
    </OrgShell>
  )
}
