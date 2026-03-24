"use client"

import { useState } from "react"
import { apiRequest } from "@/lib/api"

interface Props {
  orgId: string
  submissionId: string
}

export function DownloadZipButton({ orgId, submissionId }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setError(null)
    setLoading(true)
    try {
      const { download_url } = await apiRequest<{ download_url: string }>(
        `/orgs/${orgId}/submissions/${submissionId}/download-url`
      )
      window.open(download_url, "_blank", "noopener,noreferrer")
    } catch {
      setError("Failed to get download link — please try again")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleDownload}
        disabled={loading}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "Generating link…" : "Download Zip"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
