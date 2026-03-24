import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/server-auth"

/**
 * Auth guard for all (org) routes.
 * Does NOT render OrgShell — each sub-layout provides its own shell with
 * the correct orgId context (or none for flat placeholder routes).
 */
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session) redirect("/login")
  if (session.user.account_type === "participant") redirect("/dashboard")
  return <>{children}</>
}
