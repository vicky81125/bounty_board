"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api"

const MAX_FILE_BYTES = 52_428_800 // 50 MB

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

  // Zip replacement
  const [newFile, setNewFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)

  // Download existing zip
  const [downloadLoading, setDownloadLoading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload() {
    setDownloadLoading(true)
    try {
      const { download_url } = await apiRequest<{ download_url: string }>(
        `/bounties/${bountyId}/submissions/mine/download-url`
      )
      window.open(download_url, "_blank", "noopener,noreferrer")
    } catch {
      setError("Failed to get download link — please try again")
    } finally {
      setDownloadLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_BYTES) {
      setError("File exceeds 50 MB limit")
      return
    }
    setError(null)
    setNewFile(f)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const patch: Record<string, unknown> = {}

      if (description !== initialDescription) {
        patch.description = description
      }

      if (activeTab !== currentType) {
        patch.new_submission_type = activeTab
      }

      if (activeTab === "zip") {
        if (newFile) {
          // Step 1: get signed replacement URL
          const urlResp = await apiRequest<{ signed_url: string; upload_token: string }>(
            `/bounties/${bountyId}/submissions/${submissionId}/replace-url`,
            { method: "POST" }
          )
          // Step 2: PUT file directly to storage
          setUploadProgress(0)
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            xhr.open("PUT", urlResp.signed_url)
            xhr.setRequestHeader("Content-Type", "application/zip")
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable)
                setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
            }
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve()
              else reject(new Error(`Upload failed (${xhr.status})`))
            }
            xhr.onerror = () => reject(new Error("Network error during upload"))
            xhr.send(newFile)
          })
          patch.upload_token = urlResp.upload_token
        }
        // No external_url when staying/switching to zip
      } else {
        if (externalUrl) patch.external_url = externalUrl
      }

      // Only send PATCH if there's something to change
      if (Object.keys(patch).length === 0) {
        router.refresh()
        return
      }

      await apiRequest(`/bounties/${bountyId}/submissions/${submissionId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      })
      router.refresh()
    } catch (err: any) {
      setError(err?.body?.detail ?? err?.message ?? "Failed to save — please try again")
      setUploadProgress(null)
    } finally {
      setSaving(false)
    }
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

      {/* Format tabs */}
      {submissionFormats.length > 1 && (
        <div className="flex gap-1 rounded-lg border p-1 bg-muted/40 w-fit">
          {submissionFormats.map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => { setActiveTab(fmt); setError(null); setNewFile(null) }}
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

      {/* Zip section */}
      {activeTab === "zip" && (
        <div className="space-y-3">
          {/* Current file indicator */}
          {currentType === "zip" && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">📦 Current zip file uploaded</span>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadLoading}
                className="text-xs text-primary hover:underline disabled:opacity-50"
              >
                {downloadLoading ? "Getting link…" : "Download"}
              </button>
            </div>
          )}

          {/* Replace / new zip upload */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              {currentType === "zip" ? "Replace zip file" : "Upload zip file"}
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                Max 50 MB · optional if only updating description
              </span>
            </p>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const f = e.dataTransfer.files[0]
                if (!f) return
                if (f.size > MAX_FILE_BYTES) { setError("File exceeds 50 MB limit"); return }
                setError(null)
                setNewFile(f)
              }}
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
            >
              {newFile ? (
                <p className="text-sm font-medium">{newFile.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Drag &amp; drop a .zip here, or click to browse
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
                  <div className="h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">Uploading… {uploadProgress}%</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* URL section */}
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
        disabled={saving}
        className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {saving
          ? uploadProgress !== null && uploadProgress < 100
            ? `Uploading… ${uploadProgress}%`
            : "Saving…"
          : "Save Changes"}
      </button>
    </form>
  )
}
