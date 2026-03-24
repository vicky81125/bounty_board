"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { apiRequest } from "@/lib/api"

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
})

type FormData = z.infer<typeof schema>

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

export default function NewOrgPage() {
  const router = useRouter()
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value
    setValue("name", name)
    setValue("slug", toSlug(name))
  }

  async function onSubmit(data: FormData) {
    setApiError(null)
    setSubmitting(true)
    try {
      const org = await apiRequest<{ id: string }>("/orgs", {
        method: "POST",
        body: JSON.stringify(data),
      })
      router.push(`/org/${org.id}/dashboard`)
    } catch (err: any) {
      const detail = err?.body?.detail ?? "Failed to create organisation"
      setApiError(typeof detail === "string" ? detail : "Failed to create organisation")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Create Organisation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your org to start posting bounties.
          </p>
        </div>

        {apiError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Organisation Name <span className="text-destructive">*</span>
            </label>
            <input
              {...register("name")}
              onChange={handleNameChange}
              placeholder="Acme Labs"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">
              Slug <span className="text-destructive">*</span>
            </label>
            <input
              {...register("slug")}
              placeholder="acme-labs"
              className="w-full rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only
            </p>
            {errors.slug && (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Organisation"}
          </button>
        </form>
      </div>
    </div>
  )
}
