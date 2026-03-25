"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api"

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

interface Props {
  orgId: string
  bountyId: string
  submissionId: string
  rubric: { criterion: string; max_points: number }[]
  existingScore: ExistingScore | null
  isAdmin: boolean
}

export function ScoreForm({
  orgId,
  bountyId,
  submissionId,
  rubric,
  existingScore,
  isAdmin,
}: Props) {
  const router = useRouter()

  const initialScores = rubric.map((r) => {
    const existing = existingScore?.criteria_scores.find(
      (cs) => cs.criterion === r.criterion
    )
    return {
      criterion: r.criterion,
      max_points: r.max_points,
      score: existing?.score ?? 0,
    }
  })

  const [scores, setScores] = useState<{ criterion: string; max_points: number; score: number }[]>(initialScores)
  const [notes, setNotes] = useState(existingScore?.notes ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOverride = isAdmin && existingScore !== null
  const title = isOverride ? "Override Score" : "Rubric Scoring"

  const totalScore = scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0)
  const maxPossible = rubric.reduce((sum, r) => sum + r.max_points, 0)
  const percentage = maxPossible > 0 ? Math.min(100, (totalScore / maxPossible) * 100) : 0

  function handleScoreChange(index: number, value: string) {
    setScores((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], score: value === "" ? 0 : Number(value) }
      return updated
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const body = {
        criteria_scores: scores.map((s) => ({
          criterion: s.criterion,
          score: Number(s.score),
        })),
        notes: notes.trim() || null,
      }

      const method = existingScore ? "PATCH" : "POST"
      await apiRequest(`/orgs/${orgId}/submissions/${submissionId}/score`, {
        method,
        body: JSON.stringify(body),
      })

      router.push(`/org/${orgId}/submissions/${bountyId}/${submissionId}`)
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save score. Please try again."
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="rounded-lg border p-5 space-y-5">
        <h2 className="font-semibold">{title}</h2>

        {/* Criterion inputs */}
        <div className="space-y-4">
          {rubric.map((r, i) => {
            const current = Number(scores[i]?.score ?? 0)
            const isOverMax = current > r.max_points
            return (
              <div key={r.criterion} className="flex items-center gap-4">
                <label className="flex-1 text-sm text-muted-foreground">
                  {r.criterion}
                </label>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={r.max_points}
                    step={1}
                    value={scores[i]?.score ?? 0}
                    onChange={(e) => handleScoreChange(i, e.target.value)}
                    className={`w-20 rounded-md border px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary ${
                      isOverMax
                        ? "border-red-500 focus:ring-red-500"
                        : "border-input"
                    }`}
                  />
                  <span className="text-sm text-muted-foreground w-16 text-right">
                    / {r.max_points}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Running total */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Total</span>
            <span className={totalScore > maxPossible ? "text-red-600" : ""}>
              {totalScore} / {maxPossible}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${
                percentage >= 80
                  ? "bg-green-500"
                  : percentage >= 50
                  ? "bg-amber-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {percentage.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Add any scoring notes or feedback for the participant..."
          className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 rounded-md border border-red-200 bg-red-50 px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || scores.some((s) => Number(s.score) > s.max_points)}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50 hover:opacity-90"
      >
        {submitting ? "Saving..." : isOverride ? "Override Score" : "Save Score"}
      </button>
    </form>
  )
}
