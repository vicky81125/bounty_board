import { serverFetch } from "@/lib/server-api"
import Link from "next/link"

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
}

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
}

export default async function OrgBountiesPage({ params }: Props) {
  const { orgId } = await params
  const bounties = (await serverFetch<Bounty[]>(`/orgs/${orgId}/bounties`)) ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bounties</h1>
        <Link
          href={`/org/${orgId}/bounties/new`}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + New Bounty
        </Link>
      </div>

      {bounties.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No bounties yet.
        </div>
      ) : (
        <div className="space-y-2">
          {bounties.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/30"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{b.title}</p>
                <p className="text-xs text-muted-foreground capitalize">{b.difficulty}</p>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColors[b.status]}`}
                >
                  {b.status}
                </span>
                <Link
                  href={`/org/${orgId}/bounties/${b.id}/edit`}
                  className="text-xs text-primary hover:underline"
                >
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
