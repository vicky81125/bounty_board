import Link from "next/link"
import { notFound } from "next/navigation"
import { getSubmission } from "@/app/actions/queries/submissions"
import { getBounty } from "@/app/actions/queries/bounties"
import { requireOrgMember } from "@/app/actions/_auth"
import { ScoreForm } from "./score-form"

interface Props {
  params: Promise<{ orgId: string; bountyId: string; subId: string }>
}

export default async function ScorePage({ params }: Props) {
  const { orgId, bountyId, subId } = await params

  const [auth, submissionResult, bountyResult] = await Promise.all([
    requireOrgMember(orgId),
    getSubmission(subId, orgId),
    getBounty(bountyId),
  ])

  if (!auth.ok) notFound()
  if (submissionResult.error || !submissionResult.data) notFound()
  if (bountyResult.error || !bountyResult.data) notFound()

  const submission = submissionResult.data as any
  const bounty = bountyResult.data as any
  const isAdmin = auth.memberRole === "admin"

  // Existing score comes from the joined submission_scores array
  const existingScore = submission.submission_scores?.[0] ?? null

  if (submission.status !== "under_review" && submission.status !== "scored") {
    return (
      <div className="space-y-4">
        <Link
          href={`/org/${orgId}/submissions/${bountyId}/${subId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to submission
        </Link>
        <div className="rounded-lg border border-border bg-muted p-6 text-center space-y-3">
          <p className="font-medium text-foreground">Cannot score this submission yet.</p>
          <p className="text-sm text-muted-foreground">
            Mark the submission as <strong>Under Review</strong> before scoring.
          </p>
          <Link
            href={`/org/${orgId}/submissions/${bountyId}/${subId}`}
            className="inline-block text-sm text-foreground underline hover:opacity-70"
          >
            ← Go back and update status
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/org/${orgId}/submissions/${bountyId}/${subId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to submission
        </Link>
        <h1 className="text-2xl font-bold mt-1">
          {existingScore ? "Override Score" : "Score Submission"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {submission.profiles?.display_name ?? "—"} — {bounty.title}
        </p>
      </div>

      <ScoreForm
        orgId={orgId}
        bountyId={bountyId}
        submissionId={subId}
        rubric={bounty.rubric ?? []}
        existingScore={existingScore}
        isAdmin={isAdmin}
      />
    </div>
  )
}
