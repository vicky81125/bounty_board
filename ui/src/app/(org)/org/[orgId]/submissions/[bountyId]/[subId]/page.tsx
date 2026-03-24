import Link from "next/link"
import { notFound } from "next/navigation"
import { serverFetch } from "@/lib/server-api"
import { DownloadZipButton } from "./download-zip-button"
import { SubmissionStatusActions } from "../submission-status-actions"

interface Submission {
  id: string
  bounty_id: string
  user_display_name: string
  user_email: string
  submission_type: "zip" | "github_url" | "drive_url"
  status: string
  external_url: string | null
  file_path: string | null
  description: string
  attempt_number: number
  review_notes: string | null
  submitted_at: string | null
  reviewed_at: string | null
}

interface Bounty {
  id: string
  title: string
  rubric: { criterion: string; max_points: number }[]
}

interface Props {
  params: Promise<{ orgId: string; bountyId: string; subId: string }>
}

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  under_review: "bg-blue-100 text-blue-800",
  scored: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
}

export default async function SubmissionDetailPage({ params }: Props) {
  const { orgId, bountyId, subId } = await params

  const [submission, bounty] = await Promise.all([
    serverFetch<Submission>(
      `/orgs/${orgId}/bounties/${bountyId}/submissions`,
      { noCache: true }
    ).then((list) => (list as Submission[] | null)?.find((s) => s.id === subId) ?? null),
    serverFetch<Bounty>(`/bounties/${bountyId}`),
  ])

  if (!submission || !bounty) notFound()

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
                <p className="font-medium">{submission.user_display_name}</p>
                <p className="text-xs text-muted-foreground">{submission.user_email}</p>
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
              <span>
                Attempt #{submission.attempt_number}
              </span>
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

          {/* Submission file / URL */}
          <div className="rounded-lg border p-4 space-y-3">
            <h2 className="font-semibold text-sm">Submission</h2>
            {submission.submission_type === "zip" ? (
              <DownloadZipButton orgId={orgId} submissionId={subId} />
            ) : (
              <a
                href={submission.external_url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline break-all"
              >
                {submission.external_url}
              </a>
            )}
          </div>

          {/* Description */}
          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="font-semibold text-sm">Description</h2>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {submission.description}
            </p>
          </div>

          {/* Review notes */}
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

          {/* Rubric — read-only preview */}
          {bounty.rubric.length > 0 && (
            <div className="rounded-lg border p-4 space-y-3">
              <h2 className="font-semibold text-sm">Rubric</h2>
              <ul className="space-y-1.5 text-sm">
                {bounty.rubric.map((r, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{r.criterion}</span>
                    <span className="font-medium tabular-nums">{r.max_points} pts</span>
                  </li>
                ))}
                <li className="flex items-center justify-between border-t pt-1.5 font-medium">
                  <span>Total</span>
                  <span>{bounty.rubric.reduce((s, r) => s + r.max_points, 0)} pts</span>
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">Scoring available in Phase 4</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
