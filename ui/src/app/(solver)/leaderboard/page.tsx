import { getGlobalLeaderboard } from "@/app/actions/queries/leaderboard"
import Link from "next/link"

const MEDAL_COLORS = [
  { bg: "bg-black/10", border: "border-black/20", text: "text-foreground" },
  { bg: "bg-black/5", border: "border-black/10", text: "text-foreground/80" },
  { bg: "bg-black/5", border: "border-black/10", text: "text-foreground/70" },
]

const DIFFICULTY_BADGE: Record<string, string> = {
  hard: "bg-black/20 text-black/90",
  medium: "bg-black/10 text-black/80",
  easy: "bg-black/5 text-black/70",
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("")
}

const PAGE_SIZE = 50

export default async function GlobalLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? 1))
  const offset = (page - 1) * PAGE_SIZE

  const result = await getGlobalLeaderboard(PAGE_SIZE, offset)

  if (result.error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Global Leaderboard</h1>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load leaderboard.
        </div>
      </div>
    )
  }

  const entries = result.data?.items ?? []
  const total = result.data?.total ?? 0
  const podium = entries.slice(0, 3)
  const rest = entries.slice(3)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Global Leaderboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Top participants ranked by total score across all bounties.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No entries yet. Be the first to submit and get scored!
        </div>
      ) : (
        <>
          {/* Podium — top 3 */}
          {podium.length > 0 && page === 1 && (
            <div className="flex flex-wrap justify-center gap-4">
              {podium.map((entry: any, i: number) => {
                const medal = MEDAL_COLORS[i]
                return (
                  <div
                    key={entry.user_id}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 px-6 py-5 min-w-[140px] ${medal.bg} ${medal.border} ${
                      entry.is_caller ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                  >
                    <div
                      className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold ${medal.bg} ${medal.text} border-2 ${medal.border}`}
                    >
                      {getInitials(entry.display_name)}
                    </div>
                    <span className={`text-xs font-bold ${medal.text}`}>#{entry.rank}</span>
                    <p className="text-sm font-semibold text-center leading-tight max-w-[120px] truncate">
                      {entry.display_name}
                    </p>
                    <p className={`text-lg font-bold tabular-nums ${medal.text}`}>
                      {Number(entry.global_score).toFixed(1)}
                    </p>
                    {entry.is_caller && (
                      <span className="text-xs rounded-full bg-black text-white px-2 py-0.5 font-medium">
                        You
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Table */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium w-16">Rank</th>
                  <th className="px-4 py-3 text-left font-medium">Participant</th>
                  <th className="px-4 py-3 text-right font-medium">Score</th>
                  <th className="px-4 py-3 text-right font-medium">Bounties Solved</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Skills</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry: any) => (
                  <tr
                    key={entry.user_id}
                    className={entry.is_caller ? "bg-primary/5 font-medium" : "hover:bg-muted/20"}
                  >
                    <td className="px-4 py-3 font-medium tabular-nums text-muted-foreground">
                      #{entry.rank}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                          {getInitials(entry.display_name)}
                        </div>
                        <span className="font-medium">{entry.display_name}</span>
                        {entry.is_caller && (
                          <span className="text-xs rounded-full bg-black text-white px-2 py-0.5 font-medium">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {Number(entry.global_score).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {entry.bounties_solved}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {(entry.top_difficulties ?? []).slice(0, 3).map((diff: string) => (
                          <span
                            key={diff}
                            className={`text-xs rounded-full px-2 py-0.5 capitalize font-medium ${
                              DIFFICULTY_BADGE[diff] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {diff}
                          </span>
                        ))}
                        {(entry.top_difficulties ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Link
                href={`/leaderboard?page=${Math.max(1, page - 1)}`}
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
                href={`/leaderboard?page=${Math.min(totalPages, page + 1)}`}
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
    </div>
  )
}
