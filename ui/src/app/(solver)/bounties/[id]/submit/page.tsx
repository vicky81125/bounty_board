"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api"

const MAX_FILE_BYTES = 52_428_800 // 50 MB

type SubmissionType = "zip" | "github_url" | "drive_url"

type Bounty = {
  id: string
  title: string
  status: string
  submission_formats: SubmissionType[]
  max_submissions_per_user: number | null
}

export default function SubmitPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [bounty, setBounty] = useState<Bounty | null>(null)
  const [loading, setLoading] = useState(true)

  const [activeType, setActiveType] = useState<SubmissionType>("zip")
  const [description, setDescription] = useState("")
  const [externalUrl, setExternalUrl] = useState("")

  // Zip file selection (no upload yet — upload happens on submit)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/bounties/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: Bounty) => {
        setBounty(data)
        if (data.submission_formats?.length > 0) {
          setActiveType(data.submission_formats[0])
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  // Redirect if bounty is not open
  useEffect(() => {
    if (!loading && bounty && bounty.status !== "open") {
      router.replace(`/bounties/${id}`)
    }
  }, [loading, bounty, id, router])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      setError("File exceeds 50 MB limit")
      return
    }
    setError(null)
    setFile(f)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!bounty) return
    setError(null)

    if (activeType === "zip" && !file) {
      setError("Please select a zip file")
      return
    }

    setSubmitting(true)
    try {
      let uploadToken: string | undefined

      if (activeType === "zip" && file) {
        // Step 1: get signed upload URL
        const urlResp = await apiRequest<{ signed_url: string; upload_token: string }>(
          `/bounties/${id}/submissions/upload-url`,
          { method: "POST" }
        )

        // Step 2: PUT file directly to Supabase Storage (XHR for progress)
        setUploadProgress(0)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open("PUT", urlResp.signed_url)
          xhr.setRequestHeader("Content-Type", "application/zip")
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve()
            else reject(new Error(`Upload failed (${xhr.status}) — please try again`))
          }
          xhr.onerror = () => reject(new Error("Network error during upload — please try again"))
          xhr.send(file)
        })

        uploadToken = urlResp.upload_token
      }

      // Step 3: create submission record
      await apiRequest(`/bounties/${id}/submissions`, {
        method: "POST",
        body: JSON.stringify({
          submission_type: activeType,
          upload_token: uploadToken,
          external_url: activeType !== "zip" ? externalUrl : undefined,
          description,
        }),
      })
      router.push(`/bounties/${id}/my-submission`)
    } catch (err: any) {
      setError(err?.body?.detail ?? err?.message ?? "Submission failed — please try again")
      setUploadProgress(null)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (!bounty) return null

  const formats = bounty.submission_formats ?? []

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Submit Solution</h1>
        <p className="text-sm text-muted-foreground mt-1">{bounty.title}</p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Submission Type Tabs */}
        {formats.length > 1 && (
          <div className="flex gap-1 rounded-lg border p-1 bg-muted/40 w-fit">
            {formats.map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => { setActiveType(fmt); setError(null) }}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeType === fmt
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {fmt === "zip" ? "Zip File" : fmt === "github_url" ? "GitHub URL" : "Drive URL"}
              </button>
            ))}
          </div>
        )}

        {/* Zip Upload */}
        {activeType === "zip" && (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Upload Zip File
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                Max 50 MB · ZIP only
              </span>
            </label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (!f) return
                if (f.size > MAX_FILE_BYTES) { setError("File exceeds 50 MB limit"); return }
                setError(null)
                setFile(f)
              }}
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            >
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Drag &amp; drop a .zip file here, or click to browse
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Uploading… {uploadProgress}%</p>
              </div>
            )}
          </div>
        )}

        {/* URL Input */}
        {activeType !== "zip" && (
          <div className="space-y-1">
            <label className="text-sm font-medium">
              {activeType === "github_url" ? "GitHub Repository URL" : "Google Drive URL"}
            </label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder={
                activeType === "github_url"
                  ? "https://github.com/owner/repo"
                  : "https://drive.google.com/..."
              }
              className="w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
        )}

        {/* Description */}
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
            rows={5}
            minLength={10}
            maxLength={5000}
            required
            placeholder="Describe what you built, your approach, and any important notes for reviewers"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || (activeType === "zip" && !file)}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting
            ? uploadProgress !== null && uploadProgress < 100
              ? `Uploading… ${uploadProgress}%`
              : "Submitting…"
            : "Submit Solution"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border px-6 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
