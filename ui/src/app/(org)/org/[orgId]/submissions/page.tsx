import { getOrgBounties } from "@/app/actions/queries/bounties"
import Link from "next/link"

interface Props {
  params: Promise<{ orgId: string }>
}

export default async function OrgSubmissionsPage({ params }: Props) {
  const { orgId } = await params
  const result = await getOrgBounties(orgId)
  const bounties = result.data ?? []

  if (bounties.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Submissions</h1>
        <p className="text-muted-foreground text-sm">
          No bounties yet.{" "}
          <Link href={`/org/${orgId}/bounties/new`} className="text-foreground underline hover:opacity-70">
            Create one
          </Link>{" "}
          to start receiving submissions.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Submissions</h1>
      <p className="text-sm text-muted-foreground">Select a bounty to view its submissions.</p>
      <ul className="space-y-2">
        {bounties.map((b: any) => (
          <li key={b.id}>
            <Link
              href={`/org/${orgId}/submissions/${b.id}`}
              className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm font-medium">{b.title}</span>
              <span
                className={`text-xs rounded-full px-2 py-0.5 capitalize ${
                  b.status === "open"
                    ? "bg-black/10 text-black/80"
                    : b.status === "draft"
                      ? "bg-muted text-muted-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {b.status}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
