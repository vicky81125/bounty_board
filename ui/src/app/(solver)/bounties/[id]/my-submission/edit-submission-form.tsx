"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateSubmission } from "@/app/actions/mutations/submissions"
import { getDownloadUrl } from "@/app/actions/mutations/submissions"

type SubmissionType = "zip" | "github_url" | "drive_url"

interface Props {
  bountyId: string
  submissionId: string
  initialDescription: string
  initialExternalUrl: string | null
  currentType: SubmissionType
  submissionFormats: SubmissionType[]
}

export function EditSubmissionForm({
  bountyId,
  submissionId,
  initialDescription,
  initialExternalUrl,
  currentType,
  submissionFormats,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<SubmissionType>(currentType)
  const [description, setDescription] = useState(initialDescription)
  const [externalUrl, setExternalUrl] = useState(initialExternalUrl ?? "")
  const [isPending, startTransition] = useTransition()
  const [downloadPending, startDownloadTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDownload() {
    startDownloadTransition(async () => {
      const result = await getDownloadUrl(submissionId)
      if (result.error) {
        setError(result.error)
      } else if (result.data?.url) {
        window.open(result.data.url, "_blank", "noopener,noreferrer")
      }
    })
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const updates: Parameters<typeof updateSubmission>[1] = {}

      if (description !== initialDescription) updates.description = description
      if (activeTab !== currentType) updates.submissionType = activeTab
      if (activeTab !== "zip" && externalUrl) updates.externalUrl = externalUrl

      if (Object.keys(updates).length === 0) {
        router.refresh()
        return
      }

      const result = await updateSubmission(submissionId, updates)
      if (result?.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  const tabLabel = (t: SubmissionType) =>
    t === "zip" ? "Zip File" : t === "github_url" ? "GitHub URL" : "Drive URL"

  return (
    <form onSubmit={handleSave} className="space-y-5 border rounded-lg p-5">
      <h2 className="font-semibold">Edit Submission</h2>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {submissionFormats.length > 1 && (
        <div className="flex gap-1 rounded-lg border p-1 bg-muted/40 w-fit">
          {submissionFormats.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => { setActiveTab(fmt); setError(null) }}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === fmt
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabLabel(fmt)}
            </button>
          ))}
        </div>
      )}

      {activeTab === "zip" && (
        <div className="space-y-3">
          {currentType === "zip" && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium">📦 Current zip file uploaded</span>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadPending}
                className="text-xs text-foreground underline hover:opacity-70 disabled:opacity-50"
              >
                {downloadPending ? "Getting link…" : "Download"}
              </button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            To replace your zip file, please submit again after this bounty rejects your current submission,
            or contact the organizer.
          </p>
        </div>
      )}

      {activeTab !== "zip" && (
        <div className="space-y-1">
          <label className="text-sm font-medium">
            {activeTab === "github_url" ? "GitHub Repository URL" : "Google Drive URL"}
          </label>
          <input
            type="url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder={
              activeTab === "github_url"
                ? "https://github.com/owner/repo"
                : "https://drive.google.com/..."
            }
            className="w-full rounded-md border px-3 py-2 text-sm"
            required
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm font-medium">
          Description
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            {description.length}/5000
          </span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          minLength={10}
          maxLength={5000}
          required
          placeholder="Describe what you built, your approach, and any important notes for reviewers"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg btn-pink px-6 py-2 text-sm disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save Changes"}
      </button>
    </form>
  )
}
