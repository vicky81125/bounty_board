"use client"

import { useState, useTransition } from "react"
import { getDownloadUrl } from "@/app/actions/mutations/submissions"

interface Props {
  orgId: string
  submissionId: string
}

export function DownloadZipButton({ orgId, submissionId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDownload() {
    setError(null)
    startTransition(async () => {
      const result = await getDownloadUrl(submissionId)
      if (result.error) {
        setError(result.error)
      } else if (result.data?.url) {
        window.open(result.data.url, "_blank", "noopener,noreferrer")
      }
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleDownload}
        disabled={isPending}
        className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isPending ? "Generating link…" : "Download Zip"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
