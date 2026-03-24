import { redirect } from "next/navigation"
import Link from "next/link"
import { serverFetch } from "@/lib/server-api"

interface Bounty {
  id: string
  title: string
  status: string
}

interface Props {
  params: Promise<{ orgId: string }>
}

export default async function OrgSubmissionsPage({ params }: Props) {
  const { orgId } = await params
  const bounties = await serverFetch<Bounty[]>(`/orgs/${orgId}/bounties`)

  if (!bounties || bounties.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Submissions</h1>
        <p className="text-muted-foreground text-sm">
          No bounties yet.{" "}
          <Link href={`/org/${orgId}/bounties/new`} className="text-primary hover:underline">
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
        {bounties.map((b) => (
          <li key={b.id}>
            <Link
              href={`/org/${orgId}/submissions/${b.id}`}
              className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm font-medium">{b.title}</span>
              <span
                className={`text-xs rounded-full px-2 py-0.5 capitalize ${
                  b.status === "open"
                    ? "bg-green-100 text-green-800"
                    : b.status === "draft"
                      ? "bg-gray-100 text-gray-600"
                      : "bg-amber-100 text-amber-800"
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
