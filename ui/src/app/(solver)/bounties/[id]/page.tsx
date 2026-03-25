import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getBounty } from "@/app/actions/queries/bounties"
import { getMySubmission, getMyBountySubmissions } from "@/app/actions/queries/submissions"
import { BountyLeaderboard } from "@/components/leaderboard/bounty-leaderboard"

interface Resource {
  label: string
  url: string
}

interface RubricRow {
  criterion: string
  max_points: number
}

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; leaderboard_page?: string }>
}

const difficultyColors: Record<string, string> = {
  easy: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  hard: "bg-red-100 text-red-800",
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Awaiting Review", color: "bg-amber-100 text-amber-800 border-amber-200" },
  under_review: { label: "Under Review", color: "bg-blue-100 text-blue-800 border-blue-200" },
  scored: { label: "Scored", color: "bg-green-100 text-green-800 border-green-200" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-800 border-red-200" },
}

function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" })
}

function daysLeft(end: string | null): string | null {
  if (!end) return null
  const diff = new Date(end).getTime() - Date.now()
  if (diff <= 0) return "Ended"
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  return `Closes in ${days} day${days === 1 ? "" : "s"}`
}

export default async function BountyDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { tab = "details", leaderboard_page } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let accountType: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single()
    accountType = profile?.account_type ?? null
  }

  const isParticipant = accountType === "participant"

  const bountyResult = await getBounty(id)
  if (bountyResult.error || !bountyResult.data) notFound()
  const bounty = bountyResult.data as any

  const [mySubmissionResult, myAllSubmissionsResult] = isParticipant
    ? await Promise.all([
        getMySubmission(id),
        getMyBountySubmissions(id),
      ])
    : [{ data: null }, { data: [] }]

  const mySubmission = mySubmissionResult.data ?? null
  const myAllSubmissions: any[] = myAllSubmissionsResult.data ?? []

  const deadline = daysLeft(bounty.end_date)
  const validTab = ["details", "leaderboard", "submissions"].includes(tab) ? tab : "details"
  const orgName = bounty.orgs?.name ?? ""
  const rubric: RubricRow[] = bounty.rubric ?? []
  const resources: Resource[] = bounty.resources ?? []

  return (
    <article className="max-w-3xl mx-auto space-y-4">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${difficultyColors[bounty.difficulty] ?? "bg-muted"}`}
          >
            {bounty.difficulty}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
              bounty.status === "open" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
            }`}
          >
            {bounty.status}
          </span>
          {(bounty.tags ?? []).map((t: string) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>
        <h1 className="text-3xl font-bold">{bounty.title}</h1>
        <p className="text-muted-foreground">{orgName}</p>
        {bounty.prize && <p className="text-xl font-semibold">{bounty.prize.label}</p>}
      </div>

      <nav className="flex border-b gap-0">
        {(
          [
            { key: "details", label: "Details" },
            { key: "leaderboard", label: "Leaderboard" },
            ...(isParticipant ? [{ key: "submissions", label: "My Submissions" }] : []),
          ] as { key: string; label: string }[]
        ).map(({ key, label }) => (
          <Link
            key={key}
            href={key === "details" ? `/bounties/${id}` : `/bounties/${id}?tab=${key}`}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              validTab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {validTab === "details" && (
        <DetailsTab
          bounty={{ ...bounty, org_name: orgName, rubric, resources, skills_required: bounty.skills_required ?? [] }}
          deadline={deadline}
          isParticipant={isParticipant}
          submission={mySubmission}
          bountyId={id}
        />
      )}

      {validTab === "leaderboard" && (
        <BountyLeaderboard bountyId={id} page={Math.max(1, Number(leaderboard_page ?? 1))} />
      )}

      {validTab === "submissions" && isParticipant && (
        <SubmissionsTab
          bountyId={id}
          submissions={myAllSubmissions}
          bountyStatus={bounty.status}
          submission={mySubmission}
        />
      )}
    </article>
  )
}

function DetailsTab({
  bounty,
  deadline,
  isParticipant,
  submission,
  bountyId,
}: {
  bounty: any
  deadline: string | null
  isParticipant: boolean
  submission: any
  bountyId: string
}) {
  return (
    <div className="space-y-8">
      <div className="flex gap-6 text-sm text-muted-foreground border rounded-lg p-4">
        <div>
          <p className="font-medium text-foreground">Start</p>
          <p>{formatDate(bounty.start_date)}</p>
        </div>
        <div>
          <p className="font-medium text-foreground">End</p>
          <p>{formatDate(bounty.end_date)}</p>
        </div>
        {deadline && (
          <div>
            <p className="font-medium text-foreground">Status</p>
            <p className={deadline === "Ended" ? "text-destructive" : "text-green-700"}>
              {deadline}
            </p>
          </div>
        )}
      </div>

      {isParticipant && (
        <div className="flex flex-wrap gap-3 items-center">
          <SubmitCTA bountyId={bountyId} bountyStatus={bounty.status} submission={submission} />
          <button className="rounded-md border px-6 py-2 text-sm hover:bg-muted">Copy for AI</button>
        </div>
      )}

      {bounty.description_md && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Description</h2>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
            {bounty.description_md}
          </pre>
        </section>
      )}

      {bounty.ideal_output_md && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Ideal Output</h2>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
            {bounty.ideal_output_md}
          </pre>
        </section>
      )}

      {bounty.skills_required.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Skills Required</h2>
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {bounty.skills_required.map((s: string, i: number) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Submission Format</h2>
        <div className="flex gap-2 flex-wrap">
          {(bounty.submission_formats ?? []).map((f: string) => (
            <span key={f} className="rounded-md bg-secondary px-3 py-1 text-sm">
              {f === "zip" ? "Zip file" : f === "github_url" ? "GitHub URL" : "Drive URL"}
            </span>
          ))}
        </div>
      </section>

      {bounty.rubric.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Scoring Rubric</h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Criterion</th>
                  <th className="px-4 py-2 text-right font-medium">Max Points</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bounty.rubric.map((row: RubricRow, i: number) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{row.criterion}</td>
                    <td className="px-4 py-2 text-right">{row.max_points}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-medium">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">
                    {bounty.rubric.reduce((s: number, r: RubricRow) => s + r.max_points, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {bounty.resources.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Resources</h2>
          <ul className="space-y-1">
            {bounty.resources.map((r: Resource, i: number) => (
              <li key={i}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {r.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bounty.eligibility_notes && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Eligibility</h2>
          <p className="text-sm text-muted-foreground">{bounty.eligibility_notes}</p>
        </section>
      )}
    </div>
  )
}

function SubmissionsTab({
  bountyId,
  submissions,
  bountyStatus,
  submission,
}: {
  bountyId: string
  submissions: any[]
  bountyStatus: string
  submission: any
}) {
  if (submissions.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        You haven&apos;t submitted anything yet.{" "}
        {bountyStatus === "open" && (
          <Link href={`/bounties/${bountyId}/submit`} className="text-primary hover:underline">
            Submit a solution
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center pb-2">
        <SubmitCTA bountyId={bountyId} bountyStatus={bountyStatus} submission={submission} />
      </div>

      {submissions.map((sub: any) => {
        const cfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.pending
        const pct =
          sub.total_score != null && sub.max_possible_score
            ? ((sub.total_score / sub.max_possible_score) * 100).toFixed(1)
            : null

        return (
          <div key={sub.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-medium text-sm">Attempt #{sub.attempt_number ?? 1}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {sub.submitted_at
                    ? new Date(sub.submitted_at).toLocaleDateString(undefined, { dateStyle: "medium" })
                    : "—"}
                </span>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium ${cfg.color}`}
              >
                {cfg.label}
              </span>
            </div>

            {sub.status === "scored" && sub.total_score != null && (
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">Score</span>
                  <span className="font-semibold tabular-nums">
                    {sub.total_score} / {sub.max_possible_score} pts
                    {pct && <span className="ml-2 text-xs text-muted-foreground">({pct}%)</span>}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                  <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            {sub.status === "under_review" && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5">
                Under review — score will appear here once grading is complete.
              </p>
            )}

            {sub.status === "rejected" && sub.review_notes && (
              <p className="text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-1.5">
                <span className="font-medium">Rejected: </span>
                {sub.review_notes}
              </p>
            )}

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="capitalize">{sub.submission_type.replace("_", " ")}</span>
              <Link
                href={`/bounties/${bountyId}/my-submission`}
                className="text-primary hover:underline"
              >
                View details →
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SubmitCTA({
  bountyId,
  bountyStatus,
  submission,
}: {
  bountyId: string
  bountyStatus: string
  submission: any
}) {
  const primary =
    "rounded-md px-6 py-2 text-sm font-medium transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"

  if (bountyStatus !== "open" && !submission) {
    return (
      <button disabled className={primary}>
        Bounty Closed
      </button>
    )
  }

  if (!submission) {
    return (
      <Link href={`/bounties/${bountyId}/submit`} className={primary}>
        Submit Solution
      </Link>
    )
  }

  const cfg = STATUS_CONFIG[submission.status]

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <span
        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${cfg.color}`}
      >
        {cfg.label}
      </span>
      {submission.status === "scored" && submission.total_score != null && (
        <span className="text-sm font-semibold tabular-nums">
          {submission.total_score} / {submission.max_possible_score} pts
        </span>
      )}
      {submission.status === "pending" && (
        <Link href={`/bounties/${bountyId}/my-submission`} className={primary}>
          Edit Submission
        </Link>
      )}
      {submission.status === "rejected" && bountyStatus === "open" && (
        <Link href={`/bounties/${bountyId}/submit`} className={primary}>
          Submit Again
        </Link>
      )}
      {submission.status !== "pending" && (
        <Link
          href={`/bounties/${bountyId}/my-submission`}
          className="rounded-md border px-6 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          View Submission
        </Link>
      )}
    </div>
  )
}
