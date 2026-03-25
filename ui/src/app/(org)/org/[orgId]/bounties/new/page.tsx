"use client"

import { useState, useTransition } from "react"
import { useRouter, useParams } from "next/navigation"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { createBounty } from "@/app/actions/mutations/bounties"
import { BOUNTY_TAGS } from "@/lib/constants"

const rubricItemSchema = z.object({
  criterion: z.string().min(1, "Required"),
  max_points: z.coerce.number().int().min(1, "Min 1"),
})

const resourceSchema = z.object({
  label: z.string().min(1, "Required"),
  url: z.string().url("Must be a valid URL"),
})

const schema = z.object({
  title: z.string().min(3).max(120),
  description_md: z.string().default(""),
  ideal_output_md: z.string().default(""),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()).default([]),
  skills_required: z.array(z.object({ value: z.string() })).default([]),
  submission_formats: z
    .array(z.enum(["zip", "github_url", "drive_url"]))
    .min(1, "Select at least one format"),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  prize_amount: z.coerce.number().min(0).optional(),
  prize_currency: z.string().default("USD"),
  max_submissions_per_user: z.coerce.number().int().min(1).optional().nullable(),
  eligibility_notes: z.string().optional(),
  resources: z.array(resourceSchema).default([]),
  rubric: z.array(rubricItemSchema).min(1, "At least one rubric criterion required"),
  status: z.enum(["draft", "open"]).default("draft"),
})

type FormData = z.infer<typeof schema>

export default function NewBountyPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const router = useRouter()
  const [apiError, setApiError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      difficulty: "medium",
      status: "draft",
      tags: [],
      skills_required: [],
      submission_formats: [],
      resources: [],
      rubric: [{ criterion: "", max_points: 10 }],
    },
  })

  const {
    fields: rubricFields,
    append: appendRubric,
    remove: removeRubric,
  } = useFieldArray({ control, name: "rubric" })

  const {
    fields: resourceFields,
    append: appendResource,
    remove: removeResource,
  } = useFieldArray({ control, name: "resources" })

  const {
    fields: skillFields,
    append: appendSkill,
    remove: removeSkill,
  } = useFieldArray({ control, name: "skills_required" })

  const watchedTags = watch("tags") ?? []
  const watchedFormats = watch("submission_formats") ?? []
  const watchedRubric = watch("rubric") ?? []
  const totalPoints = watchedRubric.reduce((s, r) => s + (Number(r.max_points) || 0), 0)

  function toggleTag(tag: string) {
    const next = watchedTags.includes(tag)
      ? watchedTags.filter((t) => t !== tag)
      : [...watchedTags, tag]
    setValue("tags", next)
  }

  function toggleFormat(fmt: "zip" | "github_url" | "drive_url") {
    const next = watchedFormats.includes(fmt)
      ? watchedFormats.filter((f) => f !== fmt)
      : [...watchedFormats, fmt]
    setValue("submission_formats", next)
  }

  function onSubmit(data: FormData) {
    setApiError(null)

    const prize =
      data.prize_amount !== undefined && data.prize_amount > 0
        ? {
            type: "single" as const,
            amount: data.prize_amount,
            currency: data.prize_currency,
            label: `${data.prize_amount} ${data.prize_currency}`,
          }
        : null

    startTransition(async () => {
      const result = await createBounty(orgId, {
        title: data.title,
        description_md: data.description_md,
        ideal_output_md: data.ideal_output_md,
        difficulty: data.difficulty,
        tags: data.tags,
        skills_required: data.skills_required.map((s) => s.value).filter(Boolean),
        submission_formats: data.submission_formats,
        start_date: data.start_date || null,
        end_date: data.end_date || null,
        prize,
        max_submissions_per_user: data.max_submissions_per_user ?? null,
        eligibility_notes: data.eligibility_notes || undefined,
        resources: data.resources.map((r) => ({ label: r.label, url: r.url })),
        rubric: data.rubric.map((r) => ({
          criterion: r.criterion,
          max_points: Number(r.max_points),
        })),
        status: data.status,
      })

      if (result?.error) {
        setApiError(result.error)
      } else {
        router.push(`/org/${orgId}/bounties`)
      }
    })
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">New Bounty</h1>

      {apiError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basics */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Basics</h2>

          <Field label="Title" required error={errors.title?.message}>
            <input
              {...register("title")}
              maxLength={120}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. Build an AI-powered summariser"
            />
          </Field>

          <Field label="Difficulty" required>
            <div className="flex gap-3">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" value={d} {...register("difficulty")} />
                  <span className="capitalize">{d}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Status">
            <div className="flex gap-3">
              {(["draft", "open"] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" value={s} {...register("status")} />
                  <span className="capitalize">{s}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Tags">
            <div className="flex flex-wrap gap-2">
              {BOUNTY_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                    watchedTags.includes(tag)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </Field>
        </section>

        {/* Description */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Description</h2>

          <Field label="Description (Markdown)">
            <textarea
              {...register("description_md")}
              rows={6}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder="Describe the bounty in detail…"
            />
          </Field>

          <Field label="Ideal Output / Expected Behaviour (Markdown)">
            <textarea
              {...register("ideal_output_md")}
              rows={4}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
              placeholder="What does a perfect submission look like?"
            />
          </Field>

          <div className="space-y-2">
            <label className="text-sm font-medium">Skills Required</label>
            <div className="space-y-2">
              {skillFields.map((field, i) => (
                <div key={field.id} className="flex gap-2">
                  <input
                    {...register(`skills_required.${i}.value`)}
                    className="flex-1 rounded-md border px-3 py-2 text-sm"
                    placeholder="e.g. Python 3.10+"
                  />
                  <button
                    type="button"
                    onClick={() => removeSkill(i)}
                    className="text-destructive text-sm px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => appendSkill({ value: "" })}
              className="text-sm text-primary hover:underline"
            >
              + Add skill
            </button>
          </div>
        </section>

        {/* Submission & Prize */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">Submission &amp; Prize</h2>

          <Field
            label="Submission Formats"
            required
            error={errors.submission_formats?.message}
          >
            <div className="flex gap-4">
              {(["zip", "github_url", "drive_url"] as const).map((fmt) => (
                <label key={fmt} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={watchedFormats.includes(fmt)}
                    onChange={() => toggleFormat(fmt)}
                  />
                  <span>{fmt === "zip" ? "Zip file" : fmt === "github_url" ? "GitHub URL" : "Drive URL"}</span>
                </label>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date">
              <input
                type="datetime-local"
                {...register("start_date")}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </Field>
            <Field label="End Date">
              <input
                type="datetime-local"
                {...register("end_date")}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Prize Amount">
              <input
                type="number"
                step="0.01"
                min="0"
                {...register("prize_amount")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="500"
              />
            </Field>
            <Field label="Currency">
              <select
                {...register("prize_currency")}
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
              >
                {["USD", "INR", "GBP", "EUR"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Max submissions per user">
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                step={1}
                {...register("max_submissions_per_user")}
                className="w-32 rounded-md border px-3 py-2 text-sm"
                placeholder="Unlimited"
              />
              <span className="text-xs text-muted-foreground">Leave blank for unlimited</span>
            </div>
          </Field>

          <Field label="Eligibility Notes (optional)">
            <textarea
              {...register("eligibility_notes")}
              rows={2}
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="e.g. Open to students only"
            />
          </Field>

          <div className="space-y-2">
            <label className="text-sm font-medium">Resources</label>
            <div className="space-y-2">
              {resourceFields.map((field, i) => (
                <div key={field.id} className="flex gap-2">
                  <input
                    {...register(`resources.${i}.label`)}
                    className="w-1/3 rounded-md border px-3 py-2 text-sm"
                    placeholder="Label"
                  />
                  <input
                    {...register(`resources.${i}.url`)}
                    className="flex-1 rounded-md border px-3 py-2 text-sm"
                    placeholder="https://…"
                  />
                  <button
                    type="button"
                    onClick={() => removeResource(i)}
                    className="text-destructive text-sm px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => appendResource({ label: "", url: "" })}
              className="text-sm text-primary hover:underline"
            >
              + Add resource
            </button>
          </div>
        </section>

        {/* Rubric */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold border-b pb-2">
            Rubric{" "}
            <span className="text-sm font-normal text-muted-foreground">
              (total: {totalPoints} pts)
            </span>
          </h2>

          {errors.rubric?.root && (
            <p className="text-xs text-destructive">{errors.rubric.root.message}</p>
          )}

          <div className="space-y-2">
            {rubricFields.map((field, i) => (
              <div key={field.id} className="flex gap-2 items-start">
                <input
                  {...register(`rubric.${i}.criterion`)}
                  className="flex-1 rounded-md border px-3 py-2 text-sm"
                  placeholder="Criterion name"
                />
                <input
                  type="number"
                  min="1"
                  {...register(`rubric.${i}.max_points`)}
                  className="w-24 rounded-md border px-3 py-2 text-sm"
                  placeholder="pts"
                />
                {rubricFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRubric(i)}
                    className="text-destructive text-sm px-2 py-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => appendRubric({ criterion: "", max_points: 10 })}
            className="text-sm text-primary hover:underline"
          >
            + Add criterion
          </button>
        </section>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Create Bounty"}
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

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
