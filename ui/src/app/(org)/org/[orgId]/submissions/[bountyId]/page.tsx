import Link from "next/link"
import { notFound } from "next/navigation"
import { serverFetch } from "@/lib/server-api"
import { SubmissionStatusActions } from "./submission-status-actions"

interface Submission {
  id: string
  user_display_name: string
  user_email: string
  submission_type: "zip" | "github_url" | "drive_url"
  status: string
  attempt_number: number
  submitted_at: string | null
  total_score: number | null
  max_possible_score: number | null
}

interface Props {
  params: Promise<{ orgId: string; bountyId: string }>
  searchParams: Promise<{ status?: string }>
}

const STATUS_TABS = [
  { value: undefined, label: "All" },
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under Review" },
  { value: "scored", label: "Scored" },
  { value: "rejected", label: "Rejected" },
]

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  scored: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
}

export default async function BountySubmissionsPage({ params, searchParams }: Props) {
  const { orgId, bountyId } = await params
  const { status } = await searchParams

  const url = status
    ? `/orgs/${orgId}/bounties/${bountyId}/submissions?status_filter=${status}`
    : `/orgs/${orgId}/bounties/${bountyId}/submissions`

  const submissions = await serverFetch<Submission[]>(url, { noCache: true })
  if (submissions === null) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/org/${orgId}/submissions`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All Bounties
          </Link>
          <h1 className="text-2xl font-bold mt-1">Submissions</h1>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b">
        {STATUS_TABS.map((tab) => {
          const href =
            tab.value
              ? `/org/${orgId}/submissions/${bountyId}?status=${tab.value}`
              : `/org/${orgId}/submissions/${bountyId}`
          const active = status === tab.value || (!status && !tab.value)
          return (
            <Link
              key={tab.label}
              href={href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>

      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No submissions found.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Participant</th>
                <th className="px-4 py-3 text-left font-medium">Submitted</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Score</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {submissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <p className="font-medium">{sub.user_display_name}</p>
                    <p className="text-xs text-muted-foreground">{sub.user_email}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sub.submitted_at
                      ? new Date(sub.submitted_at).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {sub.submission_type.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        statusColors[sub.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {sub.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm">
                    {sub.status === "scored" && sub.total_score != null ? (
                      <span className="font-medium">
                        {sub.total_score}/{sub.max_possible_score}
                      </span>
                    ) : sub.status === "under_review" ? (
                      <Link
                        href={`/org/${orgId}/submissions/${bountyId}/${sub.id}/score`}
                        className="text-xs text-primary hover:underline"
                      >
                        Score
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/org/${orgId}/submissions/${bountyId}/${sub.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        View
                      </Link>
                      <SubmissionStatusActions
                        orgId={orgId}
                        submissionId={sub.id}
                        currentStatus={sub.status}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
