import Link from "next/link"
import { notFound } from "next/navigation"
import { serverFetch } from "@/lib/server-api"
import { ScoreForm } from "./score-form"

interface Submission {
  id: string
  bounty_id: string
  user_display_name: string
  user_email: string
  submission_type: "zip" | "github_url" | "drive_url"
  status: string
  attempt_number: number
  submitted_at: string | null
  total_score: number | null
  max_possible_score: number | null
}

interface Bounty {
  id: string
  title: string
  rubric: { criterion: string; max_points: number }[]
}

interface CriterionScore {
  criterion: string
  max_points: number
  score: number
}

interface ExistingScore {
  criteria_scores: CriterionScore[]
  total_score: number
  max_possible_score: number
  notes: string | null
}

interface OrgMember {
  user_id: string
  role: "admin" | "moderator" | "member"
}

interface CurrentUser {
  id: string
}

interface Props {
  params: Promise<{ orgId: string; bountyId: string; subId: string }>
}

export default async function ScorePage({ params }: Props) {
  const { orgId, bountyId, subId } = await params

  const [submission, bounty, existingScore, members, me] = await Promise.all([
    serverFetch<Submission[]>(
      `/orgs/${orgId}/bounties/${bountyId}/submissions`,
      { noCache: true }
    ).then((list) => (list as Submission[] | null)?.find((s) => s.id === subId) ?? null),
    serverFetch<Bounty>(`/bounties/${bountyId}`),
    serverFetch<ExistingScore>(`/orgs/${orgId}/submissions/${subId}/score`, { noCache: true }),
    serverFetch<OrgMember[]>(`/orgs/${orgId}/members`, { noCache: true }),
    serverFetch<CurrentUser>(`/identity/me`, { noCache: true }),
  ])

  if (!submission || !bounty) notFound()

  const isAdmin = (members ?? []).some(
    (m) => m.user_id === me?.id && m.role === "admin"
  )

  if (submission.status !== "under_review" && submission.status !== "scored") {
    return (
      <div className="space-y-4">
        <Link
          href={`/org/${orgId}/submissions/${bountyId}/${subId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to submission
        </Link>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
          <p className="font-medium text-amber-900">Cannot score this submission yet.</p>
          <p className="text-sm text-amber-700">
            Mark the submission as <strong>Under Review</strong> before scoring.
          </p>
          <Link
            href={`/org/${orgId}/submissions/${bountyId}/${subId}`}
            className="inline-block text-sm text-primary hover:underline"
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
          {submission.user_display_name} — {bounty.title}
        </p>
      </div>

      <ScoreForm
        orgId={orgId}
        bountyId={bountyId}
        submissionId={subId}
        rubric={bounty.rubric}
        existingScore={existingScore}
        isAdmin={isAdmin}
      />
    </div>
  )
}
