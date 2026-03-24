import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/server-auth"
import { serverFetch } from "@/lib/server-api"
import { OrgShell } from "@/components/layout/org-shell"
import Link from "next/link"

export default async function OrgDashboardPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")

  // If user has orgs, redirect to the first one
  const orgs = await serverFetch<{ id: string }[]>("/orgs/mine")
  if (orgs && orgs.length > 0) {
    redirect(`/org/${orgs[0].id}/dashboard`)
  }

  // No orgs yet — show the "create your org" prompt
  return (
    <OrgShell user={session.user}>
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
