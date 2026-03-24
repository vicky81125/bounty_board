import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/server-auth"
import { OrgShell } from "@/components/layout/org-shell"

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect("/login")
  if (session.user.account_type === "participant") redirect("/dashboard")

  return <OrgShell user={session.user}>{children}</OrgShell>
}
