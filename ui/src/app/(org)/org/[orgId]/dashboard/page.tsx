import { getOrgBounties } from "@/app/actions/queries/bounties"
import Link from "next/link"
import { OrgDashboardClient } from "./dashboard-client"

interface Props {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ status?: string }>
}

export default async function OrgDashboardPage({ params, searchParams }: Props) {
  const { orgId } = await params
  const { status: statusFilter } = await searchParams

  const activeTab = (["all", "draft", "open", "closed"] as const).includes(
    statusFilter as "all" | "draft" | "open" | "closed"
  )
    ? (statusFilter as string)
    : "all"

  const result = await getOrgBounties(orgId)
  const allBounties = result.data ?? []
  const bounties =
    activeTab === "all"
      ? allBounties
      : allBounties.filter((b: any) => b.status === activeTab)

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

      <div className="grid grid-cols-3 gap-4">
        {(["Total", "Open", "Draft"] as const).map((label) => {
          const count =
            label === "Total"
              ? allBounties.length
              : allBounties.filter((b: any) => b.status === label.toLowerCase()).length
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
