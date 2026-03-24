import { serverFetch } from "@/lib/server-api"
import Link from "next/link"
import { OrgDashboardClient } from "./dashboard-client"

interface Bounty {
  id: string
  title: string
  status: "draft" | "open" | "closed"
  difficulty: string
  end_date: string | null
  created_at: string
}

interface Props {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function OrgDashboardPage({ params, searchParams }: Props) {
  const { orgId } = await params
  const { status: statusFilter } = await searchParams

  const activeTab = (["all", "draft", "open", "closed"] as const).includes(
    statusFilter as any
  )
    ? (statusFilter as string)
    : "all"

  const qs = activeTab !== "all" ? `?status=${activeTab}` : ""
  const bounties = (await serverFetch<Bounty[]>(`/orgs/${orgId}/bounties${qs}`)) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link
          href={`/org/${orgId}/bounties/new`}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + New Bounty
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        {(["Total", "Open", "Draft"] as const).map((label) => {
          const count =
            label === "Total"
              ? bounties.length
              : bounties.filter((b) => b.status === label.toLowerCase()).length
          return (
            <div key={label} className="rounded-lg border p-4 text-center">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          )
        })}
      </div>

      <OrgDashboardClient bounties={bounties} orgId={orgId} activeTab={activeTab} />
    </div>
  )
}
