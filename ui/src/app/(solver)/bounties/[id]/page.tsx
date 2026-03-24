import { notFound } from "next/navigation"
import { serverFetch } from "@/lib/server-api"
import { getServerSession } from "@/lib/server-auth"

interface Resource {
  label: string
  url: string
}

interface RubricRow {
  criterion: string
  max_points: number
}

interface Bounty {
  id: string
  org_id: string
  org_name: string
  title: string
  description_md: string
  ideal_output_md: string
  start_date: string | null
  end_date: string | null
  difficulty: string
  tags: string[]
  skills_required: string[]
  submission_formats: string[]
  rubric: RubricRow[]
  status: "open" | "closed"
  prize: { type: string; amount: number; currency: string; label: string } | null
  resources: Resource[]
  eligibility_notes: string | null
  created_at: string
}

interface Props {
  params: Promise<{ id: string }>
}

const difficultyColors: Record<string, string> = {
  easy: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  hard: "bg-red-100 text-red-800",
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

export default async function BountyDetailPage({ params }: Props) {
  const { id } = await params
  const bounty = await serverFetch<Bounty>(`/bounties/${id}`)
  if (!bounty) notFound()

  const session = await getServerSession()
  const deadline = daysLeft(bounty.end_date)

  return (
    <article className="max-w-3xl space-y-8">
      {/* Header */}
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
          {bounty.tags.map((t) => (
            <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </div>

        <h1 className="text-3xl font-bold">{bounty.title}</h1>
        <p className="text-muted-foreground">{bounty.org_name}</p>

        {bounty.prize && (
          <p className="text-xl font-semibold">{bounty.prize.label}</p>
        )}
      </div>

      {/* Dates */}
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

      {/* Description */}
      {bounty.description_md && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Description</h2>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
            {bounty.description_md}
          </pre>
        </section>
      )}

      {/* Ideal Output */}
      {bounty.ideal_output_md && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Ideal Output</h2>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">
            {bounty.ideal_output_md}
          </pre>
        </section>
      )}

      {/* Skills */}
      {bounty.skills_required.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Skills Required</h2>
          <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            {bounty.skills_required.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Submission Formats */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Submission Format</h2>
        <div className="flex gap-2 flex-wrap">
          {bounty.submission_formats.map((f) => (
            <span key={f} className="rounded-md bg-secondary px-3 py-1 text-sm">
              {f === "zip" ? "Zip file" : f === "github_url" ? "GitHub URL" : "Drive URL"}
            </span>
          ))}
        </div>
      </section>

      {/* Rubric */}
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
                {bounty.rubric.map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{row.criterion}</td>
                    <td className="px-4 py-2 text-right">{row.max_points}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-medium">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">
                    {bounty.rubric.reduce((s, r) => s + r.max_points, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Resources */}
      {bounty.resources.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Resources</h2>
          <ul className="space-y-1">
            {bounty.resources.map((r, i) => (
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

      {/* Eligibility */}
      {bounty.eligibility_notes && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Eligibility</h2>
          <p className="text-sm text-muted-foreground">{bounty.eligibility_notes}</p>
        </section>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2 border-t">
        <button
          disabled={bounty.status !== "open"}
          title={bounty.status !== "open" ? "Bounty is closed" : undefined}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Submit Solution
        </button>
        <button className="rounded-md border px-6 py-2 text-sm hover:bg-muted">
          Copy for AI
        </button>
      </div>

      {/* Leaderboard placeholder */}
      <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
        Leaderboard coming soon
      </div>
    </article>
  )
}
