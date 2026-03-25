import Link from "next/link"
import { notFound } from "next/navigation"
import { getSubmission } from "@/app/actions/queries/submissions"
import { getBounty } from "@/app/actions/queries/bounties"
import { DownloadZipButton } from "./download-zip-button"
import { SubmissionStatusActions } from "../submission-status-actions"

interface Props {
  params: Promise<{ orgId: string; bountyId: string; subId: string }>
}

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  under_review: "bg-black/5 text-foreground",
  scored: "bg-black/10 text-black/80",
  rejected: "bg-destructive/10 text-destructive",
}

export default async function SubmissionDetailPage({ params }: Props) {
  const { orgId, bountyId, subId } = await params

  const [submissionResult, bountyResult] = await Promise.all([
    getSubmission(subId, orgId),
    getBounty(bountyId),
  ])

  if (submissionResult.error || !submissionResult.data) notFound()
  if (bountyResult.error || !bountyResult.data) notFound()

  const submission = submissionResult.data as any
  const bounty = bountyResult.data as any
  const rubric: { criterion: string; max_points: number }[] = bounty.rubric ?? []

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/org/${orgId}/submissions/${bountyId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to submissions
        </Link>
        <h1 className="text-2xl font-bold mt-1">{bounty.title}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: submission content */}
        <div className="md:col-span-2 space-y-5">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{submission.profiles?.display_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{submission.profiles?.email ?? ""}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                  statusColors[submission.status] ?? "bg-muted"
                }`}
              >
                {submission.status.replace("_", " ")}
              </span>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Attempt #{submission.attempt_number ?? 1}</span>
              <span>
                Submitted:{" "}
                {submission.submitted_at
                  ? new Date(submission.submitted_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </span>
              <span className="capitalize">
                {submission.submission_type.replace("_", " ")}
              </span>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="font-semibold text-sm">Submission</h2>
            {submission.submission_type === "zip" ? (
              <DownloadZipButton orgId={orgId} submissionId={subId} />
            ) : (
              <a
                href={submission.external_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-foreground underline hover:opacity-70 break-all"
              >
                {submission.external_url}
              </a>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold text-sm">Description</h2>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {submission.description}
            </p>
          </div>

          {submission.review_notes && (
            <div className="rounded-lg border border-destructive/30 p-4 space-y-2">
              <h2 className="font-semibold text-sm text-destructive">Rejection Notes</h2>
              <p className="text-sm text-muted-foreground">{submission.review_notes}</p>
            </div>
          )}
        </div>

        {/* Right: review actions + rubric */}
        <div className="space-y-5">
          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="font-semibold text-sm">Review Actions</h2>
            <SubmissionStatusActions
              orgId={orgId}
              submissionId={subId}
              currentStatus={submission.status}
            />
          </div>

          {rubric.length > 0 && (
            <div className="rounded-lg border p-4 space-y-3">
              <h2 className="font-semibold text-sm">Rubric</h2>
              <ul className="space-y-1.5 text-sm">
                {rubric.map((r, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{r.criterion}</span>
                    <span className="font-medium tabular-nums">{r.max_points} pts</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t pt-1.5 font-medium">
                  <span>Total</span>
                  <span>{rubric.reduce((s, r) => s + r.max_points, 0)} pts</span>
                </li>
              </ul>

              {submission.status === "under_review" && (
                <Link
                  href={`/org/${orgId}/submissions/${bountyId}/${subId}/score`}
                  className="inline-block w-full text-center rounded-lg btn-pink px-3 py-2 text-xs"
                >
                  Score Submission
                </Link>
              )}

              {submission.status === "scored" && submission.total_score != null && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Score</span>
                    <span className="rounded-full bg-black/10 text-black/80 px-2.5 py-0.5 text-xs font-semibold tabular-nums">
                      {submission.total_score} / {submission.max_possible_score}
                    </span>
                  </div>
                  <Link
                    href={`/org/${orgId}/submissions/${bountyId}/${subId}/score`}
                    className="inline-block text-xs text-foreground underline hover:opacity-70"
                  >
                    Revise Score
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
