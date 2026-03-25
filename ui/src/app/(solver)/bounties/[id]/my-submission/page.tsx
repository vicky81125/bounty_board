import Link from "next/link"
import { redirect } from "next/navigation"
import { serverFetch } from "@/lib/server-api"
import { getServerSession } from "@/lib/server-auth"
import { EditSubmissionForm } from "./edit-submission-form"

interface Submission {
  id: string
  bounty_id: string
  status: "pending" | "under_review" | "scored" | "rejected"
  submission_type: "zip" | "github_url" | "drive_url"
  external_url: string | null
  description: string
  attempt_number: number
  review_notes: string | null
  submitted_at: string
  total_score: number | null
  max_possible_score: number | null
}

interface Bounty {
  id: string
  title: string
  status: string
  submission_formats: ("zip" | "github_url" | "drive_url")[]
}

interface Props {
  params: Promise<{ id: string }>
}

const statusConfig = {
  pending: { label: "Awaiting Review", color: "bg-amber-100 text-amber-800" },
  under_review: { label: "Under Review", color: "bg-blue-100 text-blue-800" },
  scored: { label: "Scored", color: "bg-green-100 text-green-800" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800" },
}

export default async function MySubmissionPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession()
  if (!session) redirect("/login")
  if (session.user.account_type !== "participant") redirect("/org/dashboard")

  const [bounty, submission] = await Promise.all([
    serverFetch<Bounty>(`/bounties/${id}`),
    serverFetch<Submission>(`/bounties/${id}/submissions/mine`, { noCache: true }),
  ])

  if (!bounty) redirect(`/bounties`)

  // No submission: redirect to submit if open, else show empty state
  if (!submission) {
    if (bounty.status === "open") redirect(`/bounties/${id}/submit`)
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">{bounty.title}</h1>
        <p className="text-muted-foreground text-sm">You have not submitted a solution yet.</p>
        <Link href={`/bounties/${id}`} className="text-sm text-primary hover:underline">
          ← Back to bounty
        </Link>
      </div>
    )
  }

  const cfg = statusConfig[submission.status] ?? statusConfig.pending

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{bounty.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Attempt #{submission.attempt_number} ·{" "}
          {new Date(submission.submitted_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${cfg.color}`}>
          {cfg.label}
        </span>
        <span className="text-xs text-muted-foreground capitalize">
          {submission.submission_type.replace("_", " ")}
        </span>
      </div>

      {/* Score result */}
      {submission.status === "scored" && submission.total_score != null && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-green-900">Your Score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-green-800">
              {submission.total_score}
            </span>
            <span className="text-lg text-green-700 font-medium">
              / {submission.max_possible_score} pts
            </span>
          </div>
          {submission.max_possible_score != null && submission.max_possible_score > 0 && (
            <div className="space-y-1">
              <div className="w-full bg-green-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-green-600 transition-all"
                  style={{
                    width: `${Math.min(100, (submission.total_score / submission.max_possible_score) * 100).toFixed(1)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-green-700 text-right">
                {((submission.total_score / submission.max_possible_score) * 100).toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      )}

      {/* Under review notice */}
      {submission.status === "under_review" && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Your submission is being reviewed. You will see your score here once grading is complete.
        </div>
      )}

      {/* Rejection notes */}
      {submission.status === "rejected" && submission.review_notes && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm">
          <p className="font-medium text-destructive mb-1">Rejection reason</p>
          <p className="text-foreground">{submission.review_notes}</p>
        </div>
      )}

      {/* Submission content */}
      <section className="space-y-2">
        {submission.submission_type !== "zip" && submission.external_url && (
          <div>
            <p className="text-sm font-medium mb-1">
              {submission.submission_type === "github_url" ? "GitHub Repository" : "Google Drive"}
            </p>
            <a
              href={submission.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all"
            >
              {submission.external_url}
            </a>
          </div>
        )}
        <div>
          <p className="text-sm font-medium mb-1">Description</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {submission.description}
          </p>
        </div>
      </section>

      {/* Editable only when pending */}
      {submission.status === "pending" && (
        <EditSubmissionForm
          bountyId={id}
          submissionId={submission.id}
          initialDescription={submission.description}
          initialExternalUrl={submission.external_url}
          currentType={submission.submission_type}
          submissionFormats={bounty.submission_formats ?? [submission.submission_type]}
        />
      )}

      {/* Submit Again after rejection */}
      {submission.status === "rejected" && bounty.status === "open" && (
        <Link
          href={`/bounties/${id}/submit`}
          className="inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Submit Again
        </Link>
      )}

      <Link href={`/bounties/${id}`} className="text-sm text-muted-foreground hover:underline block">
        ← Back to bounty
      </Link>
    </div>
  )
}
