"use client"

import { useEffect, useState } from "react"
import { apiRequest } from "@/lib/api"

interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string
  global_score: number
  bounties_solved: number
  top_difficulties: string[]
  is_caller: boolean
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  total: number
  page: number
  page_size: number
  caller_rank: number | null
}

const MEDAL_COLORS = [
  { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-700", label: "Gold" },
  { bg: "bg-slate-100", border: "border-slate-300", text: "text-slate-600", label: "Silver" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-700", label: "Bronze" },
]

const DIFFICULTY_BADGE: Record<string, string> = {
  hard: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  easy: "bg-green-100 text-green-700",
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("")
}

export default function GlobalLeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 50

  async function fetchLeaderboard(p: number) {
    try {
      const result = await apiRequest<LeaderboardResponse>(
        `/leaderboard/global?page=${p}&page_size=${PAGE_SIZE}`
      )
      setData(result)
      setError(null)
    } catch {
      setError("Failed to load leaderboard.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchLeaderboard(page)

    const interval = setInterval(() => {
      fetchLeaderboard(page)
    }, 30000)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  const entries = data?.entries ?? []
  const podium = entries.slice(0, 3)
  const rest = entries.slice(3)
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)
  const callerRank = data?.caller_rank ?? null

  // Is the caller already visible in the podium or rest?
  const callerInView = entries.some((e) => e.is_caller)
  const showCallerBanner = callerRank !== null && !callerInView

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Global Leaderboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Top participants ranked by total score across all bounties.
        </p>
      </div>

      {/* Caller rank sticky note */}
      {showCallerBanner && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
          Your rank: #{callerRank}
        </div>
      )}

      {loading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Loading leaderboard...
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          No entries yet. Be the first to submit and get scored!
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <>
          {/* Podium — top 3 */}
          {podium.length > 0 && (
            <div className="flex flex-wrap justify-center gap-4">
              {podium.map((entry, i) => {
                const medal = MEDAL_COLORS[i]
                return (
                  <div
                    key={entry.user_id}
                    className={`flex flex-col items-center gap-2 rounded-xl border-2 px-6 py-5 min-w-[140px] ${medal.bg} ${medal.border} ${
                      entry.is_caller ? "ring-2 ring-primary ring-offset-2" : ""
                    }`}
                  >
                    {/* Avatar circle with initials */}
                    <div
                      className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold ${medal.bg} ${medal.text} border-2 ${medal.border}`}
                    >
                      {getInitials(entry.display_name)}
                    </div>
                    {/* Rank badge */}
                    <span className={`text-xs font-bold ${medal.text}`}>
                      #{entry.rank}
                    </span>
                    {/* Name */}
                    <p className="text-sm font-semibold text-center leading-tight max-w-[120px] truncate">
                      {entry.display_name}
                    </p>
                    {/* Score */}
                    <p className={`text-lg font-bold tabular-nums ${medal.text}`}>
                      {entry.global_score.toFixed(1)}
                    </p>
                    {/* "You" badge */}
                    {entry.is_caller && (
                      <span className="text-xs rounded-full bg-primary/20 text-primary px-2 py-0.5 font-medium">
                        You
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Table for rank 4+ */}
          {rest.length > 0 && (
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
                  {rest.map((entry) => (
                    <tr
                      key={entry.user_id}
                      className={
                        entry.is_caller ? "bg-primary/10" : "hover:bg-muted/20"
                      }
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
                            <span className="text-xs rounded-full bg-primary/20 text-primary px-2 py-0.5 font-medium">
                              You
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {entry.global_score.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {entry.bounties_solved}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {entry.top_difficulties.slice(0, 3).map((diff) => (
                            <span
                              key={diff}
                              className={`text-xs rounded-full px-2 py-0.5 capitalize font-medium ${
                                DIFFICULTY_BADGE[diff] ?? "bg-muted text-muted-foreground"
                              }`}
                            >
                              {diff}
                            </span>
                          ))}
                          {entry.top_difficulties.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted transition-colors"
              >
                ← Prev
              </button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
