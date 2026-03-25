"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { scoreSubmission, overrideScore } from "@/app/actions/mutations/scoring"

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
  const [isPending, startTransition] = useTransition()

  const initialScores = rubric.map((r) => {
    const existing = existingScore?.criteria_scores.find(
      (cs) => cs.criterion === r.criterion
    )
    return { criterion: r.criterion, max_points: r.max_points, score: existing?.score ?? 0 }
  })

  const [scores, setScores] = useState(initialScores)
  const [notes, setNotes] = useState(existingScore?.notes ?? "")
  const [error, setError] = useState<string | null>(null)

  const isOverride = isAdmin && existingScore !== null
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const criteriaScores = scores.map((s) => ({
      criterion: s.criterion,
      score: Number(s.score),
      max_points: s.max_points,
    }))

    startTransition(async () => {
      const action = isOverride ? overrideScore : scoreSubmission
      const result = await action({
        submissionId,
        orgId,
        criteriaScores,
        notes: notes.trim() || undefined,
      })

      if (result?.error) {
        setError(result.error)
      } else {
        router.push(`/org/${orgId}/submissions/${bountyId}/${submissionId}`)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="rounded-lg border p-5 space-y-5">
        <h2 className="font-semibold">{isOverride ? "Override Score" : "Rubric Scoring"}</h2>

        <div className="space-y-4">
          {rubric.map((r, i) => {
            const current = Number(scores[i]?.score ?? 0)
            const isOverMax = current > r.max_points
            return (
              <div key={r.criterion} className="flex items-center gap-4">
                <label className="flex-1 text-sm text-muted-foreground">{r.criterion}</label>
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={r.max_points}
                    step={1}
                    value={scores[i]?.score ?? 0}
                    onChange={(e) => handleScoreChange(i, e.target.value)}
                    className={`w-20 rounded-md border px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-ring ${
                      isOverMax ? "border-destructive focus:ring-destructive" : "border-input"
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

        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center justify-between text-sm font-medium">
            <span>Total</span>
            <span className={totalScore > maxPossible ? "text-destructive" : ""}>
              {totalScore} / {maxPossible}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-2 rounded-full transition-all bg-foreground/40"
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">{percentage.toFixed(1)}%</p>
        </div>
      </div>

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
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || scores.some((s) => Number(s.score) > s.max_points)}
        className="rounded-lg btn-pink px-6 py-2 text-sm disabled:opacity-50"
      >
        {isPending ? "Saving..." : isOverride ? "Override Score" : "Save Score"}
      </button>
    </form>
  )
}
