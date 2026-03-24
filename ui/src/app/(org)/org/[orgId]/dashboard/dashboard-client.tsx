"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api"

interface Bounty {
  id: string
  title: string
  status: "draft" | "open" | "closed"
  difficulty: string
  end_date: string | null
  created_at: string
}

interface Props {
  bounties: Bounty[]
  orgId: string
  activeTab: string
}

const STATUS_TABS = ["all", "draft", "open", "closed"] as const

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
}

export function OrgDashboardClient({ bounties, orgId, activeTab }: Props) {
  const router = useRouter()

  async function changeStatus(bountyId: string, newStatus: "open" | "closed") {
    const msg =
      newStatus === "open"
        ? "Open this bounty? It will be visible to all users."
        : "Close this bounty? Submissions will no longer be accepted."
    if (!confirm(msg)) return
    try {
      await apiRequest(`/orgs/${orgId}/bounties/${bountyId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      })
      router.refresh()
    } catch {
      alert("Failed to update status. Please try again.")
    }
  }

  async function deleteBounty(bountyId: string, title: string) {
    if (!confirm(`Delete "${title}"? This action cannot be undone.`)) return
    try {
      await apiRequest(`/orgs/${orgId}/bounties/${bountyId}`, { method: "DELETE" })
      router.refresh()
    } catch {
      alert("Failed to delete bounty. Only draft bounties can be deleted.")
    }
  }

  return (
    <>
      {/* Status filter tabs */}
      <div className="flex gap-1 border-b">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab}
            href={`/org/${orgId}/dashboard${tab !== "all" ? `?status=${tab}` : ""}`}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </Link>
        ))}
      </div>

      {bounties.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          No bounties yet.{" "}
          <Link href={`/org/${orgId}/bounties/new`} className="text-primary underline">
            Create your first bounty
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Difficulty</th>
                <th className="px-4 py-3 text-left font-medium">Deadline</th>
                <th className="px-4 py-3 text-left font-medium">Submissions</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bounties.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium max-w-xs truncate">{b.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColors[b.status]}`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{b.difficulty}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.end_date ? new Date(b.end_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">—</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/org/${orgId}/bounties/${b.id}/edit`}
                        className="text-xs text-primary hover:underline"
                      >
                        Edit
                      </Link>
                      {b.status === "draft" && (
                        <button
                          onClick={() => changeStatus(b.id, "open")}
                          className="text-xs text-green-700 hover:underline"
                        >
                          Open
                        </button>
                      )}
                      {b.status === "open" && (
                        <button
                          onClick={() => changeStatus(b.id, "closed")}
                          className="text-xs text-destructive hover:underline"
                        >
                          Close
                        </button>
                      )}
                      {b.status === "closed" && (
                        <span className="text-xs text-muted-foreground">Closed</span>
                      )}
                      {b.status === "draft" && (
                        <button
                          onClick={() => deleteBounty(b.id, b.title)}
                          className="text-xs text-destructive hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
