import { getServerSession } from "@/lib/server-auth"
import { redirect } from "next/navigation"

export default async function OrgDashboardPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Organizer Dashboard</h1>
      <p className="text-muted-foreground">
        Create and manage your organisation to start posting bounties.
      </p>
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-muted-foreground mb-4">You haven&apos;t created an organisation yet.</p>
        <a
          href="/org/new"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Create your first organisation
        </a>
      </div>
    </div>
  )
}
