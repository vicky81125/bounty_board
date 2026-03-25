"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateSubmissionStatus } from "@/app/actions/mutations/submissions"

interface Props {
  orgId: string
  submissionId: string
  currentStatus: string
}

export function SubmissionStatusActions({ orgId, submissionId, currentStatus }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectNotes, setRejectNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  function handleStatusChange(newStatus: "under_review" | "rejected", notes?: string) {
    startTransition(async () => {
      const result = await updateSubmissionStatus(submissionId, orgId, newStatus, notes)
      if (result?.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      <div className="flex gap-1.5">
        {currentStatus === "pending" && (
          <button
            onClick={() => handleStatusChange("under_review")}
            disabled={isPending}
            className="text-xs rounded-md border px-2 py-1 hover:bg-muted disabled:opacity-50"
          >
            Mark Under Review
          </button>
        )}
        {(currentStatus === "pending" || currentStatus === "under_review") && (
          <button
            onClick={() => setShowRejectDialog(true)}
            disabled={isPending}
            className="text-xs rounded-md border border-destructive/50 px-2 py-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Reject
          </button>
        )}
      </div>

      {showRejectDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg border shadow-lg p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold">Reject Submission</h2>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">
                Rejection reason (optional, shown to participant)
              </label>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Explain why the submission was rejected…"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRejectDialog(false)
                  handleStatusChange("rejected", rejectNotes)
                }}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
