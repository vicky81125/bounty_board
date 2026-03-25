import { getBountyLeaderboard } from "@/app/actions/queries/leaderboard"
import Link from "next/link"

const RANK_MEDALS: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
}

function formatShortDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(undefined, { dateStyle: "short" })
}

interface BountyLeaderboardProps {
  bountyId: string
  page?: number
}

const PAGE_SIZE = 20

export async function BountyLeaderboard({ bountyId, page = 1 }: BountyLeaderboardProps) {
  const offset = (page - 1) * PAGE_SIZE
  const result = await getBountyLeaderboard(bountyId, PAGE_SIZE, offset)

  if (result.error) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Leaderboard</h2>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load leaderboard.
        </div>
      </section>
    )
  }

  const entries = result.data?.items ?? []
  const total = result.data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">Leaderboard</h2>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No scored submissions yet
        </div>
      ) : (
        <>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium w-16">Rank</th>
                  <th className="px-4 py-2 text-left font-medium">Participant</th>
                  <th className="px-4 py-2 text-right font-medium">Score</th>
                  <th className="px-4 py-2 text-right font-medium">%</th>
                  <th className="px-4 py-2 text-right font-medium hidden md:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry: any) => (
                  <tr
                    key={entry.user_id}
                    className={
                      entry.is_caller ? "bg-primary/5 font-medium" : "hover:bg-muted/20"
                    }
                  >
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {RANK_MEDALS[entry.rank] ?? `#${entry.rank}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{entry.display_name}</span>
                        {entry.is_caller && (
                          <span className="text-xs rounded-full bg-black text-white px-2 py-0.5 font-medium">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {entry.total_score} / {entry.max_possible_score}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {Number(entry.score_percentage).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                      {formatShortDate(entry.submitted_at ?? null)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Link
                href={`?leaderboard_page=${Math.max(1, page - 1)}`}
                className={`rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors ${
                  page === 1 ? "pointer-events-none opacity-40" : "hover:bg-muted"
                }`}
              >
                ← Prev
              </Link>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Link
                href={`?leaderboard_page=${Math.min(totalPages, page + 1)}`}
                className={`rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors ${
                  page === totalPages ? "pointer-events-none opacity-40" : "hover:bg-muted"
                }`}
              >
                Next →
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  )
}
