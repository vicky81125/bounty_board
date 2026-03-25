import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getBounty } from "@/app/actions/queries/bounties"
import { getMySubmission } from "@/app/actions/queries/submissions"
import { EditSubmissionForm } from "./edit-submission-form"

interface Props {
  params: Promise<{ id: string }>
}

const statusConfig = {
  pending: { label: "Awaiting Review", color: "bg-muted text-muted-foreground" },
  under_review: { label: "Under Review", color: "bg-black/5 text-foreground" },
  scored: { label: "Scored", color: "bg-black/10 text-foreground" },
  rejected: { label: "Rejected", color: "bg-destructive/10 text-destructive" },
} as const

export default async function MySubmissionPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single()

  if (!profile || profile.account_type !== "participant") redirect("/org/dashboard")

  const [bountyResult, submissionResult] = await Promise.all([
    getBounty(id),
    getMySubmission(id),
  ])

  if (bountyResult.error || !bountyResult.data) redirect("/bounties")

  const bounty = bountyResult.data as any
  const submission = submissionResult.data as any ?? null

  if (!submission) {
    if (bounty.status === "open") redirect(`/bounties/${id}/submit`)
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">{bounty.title}</h1>
        <p className="text-muted-foreground text-sm">You have not submitted a solution yet.</p>
        <Link href={`/bounties/${id}`} className="text-sm text-foreground underline hover:opacity-70">
          ← Back to bounty
        </Link>
      </div>
    )
  }

  const cfg = statusConfig[submission.status as keyof typeof statusConfig] ?? statusConfig.pending

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{bounty.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Attempt #{submission.attempt_number ?? 1} ·{" "}
          {submission.submitted_at
            ? new Date(submission.submitted_at).toLocaleDateString(undefined, { dateStyle: "medium" })
            : "—"}
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

      {submission.status === "scored" && submission.total_score != null && (
        <div className="rounded-xl border border-border bg-card px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">Your Score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-foreground">
              {submission.total_score}
            </span>
            <span className="text-lg text-muted-foreground font-medium">
              / {submission.max_possible_score} pts
            </span>
          </div>
          {submission.max_possible_score != null && submission.max_possible_score > 0 && (
            <div className="space-y-1">
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-foreground/40 transition-all"
                  style={{
                    width: `${Math.min(100, (submission.total_score / submission.max_possible_score) * 100).toFixed(1)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {((submission.total_score / submission.max_possible_score) * 100).toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      )}

      {submission.status === "under_review" && (
        <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Your submission is being reviewed. You will see your score here once grading is complete.
        </div>
      )}

      {submission.status === "rejected" && submission.review_notes && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm">
          <p className="font-medium text-destructive mb-1">Rejection reason</p>
          <p className="text-foreground">{submission.review_notes}</p>
        </div>
      )}

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
              className="text-sm text-foreground underline hover:opacity-70 break-all"
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

      {submission.status === "rejected" && bounty.status === "open" && (
        <Link
          href={`/bounties/${id}/submit`}
          className="inline-block rounded-lg btn-pink px-6 py-2 text-sm"
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
