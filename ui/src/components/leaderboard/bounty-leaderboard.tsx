"use client"

import { useEffect, useState } from "react"
import { apiRequest } from "@/lib/api"

interface LeaderboardEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null
  total_score: number
  max_possible_score: number
  score_percentage: number
  scored_at: string | null
  is_caller: boolean
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[]
  total: number
  page: number
  page_size: number
  bounty_max_score: number
}

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
  currentUserId?: string
}

export function BountyLeaderboard({ bountyId }: BountyLeaderboardProps) {
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const PAGE_SIZE = 20

  async function fetchLeaderboard(p: number) {
    try {
      const result = await apiRequest<LeaderboardResponse>(
        `/bounties/${bountyId}/leaderboard?page=${p}&page_size=${PAGE_SIZE}`
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
  }, [page, bountyId])

  const entries = data?.entries ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <section className="space-y-4">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <span className="text-xs text-muted-foreground">Updates every 30s</span>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="rounded-lg border overflow-hidden">
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
              {[0, 1, 2].map((i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="h-4 w-6 rounded bg-muted animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="h-4 w-16 rounded bg-muted animate-pulse ml-auto" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="h-4 w-10 rounded bg-muted animate-pulse ml-auto" />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="h-4 w-20 rounded bg-muted animate-pulse ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No scored submissions yet
        </div>
      )}

      {/* Leaderboard table */}
      {!loading && !error && entries.length > 0 && (
        <>
          <div className="rounded-lg border overflow-hidden">
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
                {entries.map((entry) => (
                  <tr
                    key={entry.user_id}
                    className={
                      entry.is_caller
                        ? "bg-primary/10 font-medium"
                        : "hover:bg-muted/20"
                    }
                  >
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {RANK_MEDALS[entry.rank] ?? `#${entry.rank}`}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{entry.display_name}</span>
                        {entry.is_caller && (
                          <span className="text-xs rounded-full bg-primary/20 text-primary px-2 py-0.5 font-medium">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {entry.total_score} / {entry.max_possible_score}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {entry.score_percentage}%
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                      {formatShortDate(entry.scored_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
    </section>
  )
}
