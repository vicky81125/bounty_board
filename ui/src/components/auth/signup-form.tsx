"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ApiError, authApi } from "@/lib/api"
import type { SessionResponse } from "@/lib/auth"
import { useAuth } from "@/providers/auth-provider"

// ── Schemas ────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  display_name: z.string().min(1, "Display name is required").max(80),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-z0-9_-]+$/, "Only lowercase letters, numbers, hyphens, and underscores"),
})

const step2Schema = z.object({
  bio: z.string().max(500).optional(),
  location: z.string().max(100).optional(),
  skills: z.array(z.string()).optional(),
  website_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  github_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  linkedin_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
  twitter_url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
})

const step3Schema = z.object({
  account_type: z.enum(["organizer", "participant"]),
})

type Step1Values = z.infer<typeof step1Schema>
type Step2Values = z.infer<typeof step2Schema>
type Step3Values = z.infer<typeof step3Schema>

// ── Component ──────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3

const STEP_LABELS = ["Account details", "Profile info", "Account type"]

export function SignupForm() {
  const { refreshSession } = useAuth()
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [serverError, setServerError] = useState<string | null>(null)
  const [focusField, setFocusField] = useState<string | null>(null)

  // Skill tag state
  const [skillInput, setSkillInput] = useState("")
  const [skills, setSkills] = useState<string[]>([])

  // Username availability
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const usernameTimeout = useCallback(
    (() => {
      let t: ReturnType<typeof setTimeout> | null = null
      return (fn: () => void) => {
        if (t) clearTimeout(t)
        t = setTimeout(fn, 400)
      }
    })(),
    [],
  )

  const form1 = useForm<Step1Values>({ resolver: zodResolver(step1Schema) })
  const form2 = useForm<Step2Values>({ resolver: zodResolver(step2Schema) })
  const form3 = useForm<Step3Values>({ resolver: zodResolver(step3Schema) })

  // ── Username availability check ──────────────────────────────────────────

  function handleUsernameChange(e: React.ChangeEvent<HTMLInputElement>) {
    form1.setValue("username", e.target.value)
    setUsernameAvailable(null)
    const val = e.target.value
    if (val.length >= 3) {
      setUsernameChecking(true)
      usernameTimeout(async () => {
        try {
          const res = await authApi.checkUsername(val)
          setUsernameAvailable(res.available)
        } catch {
          setUsernameAvailable(null)
        } finally {
          setUsernameChecking(false)
        }
      })
    }
  }

  // ── Step navigation ──────────────────────────────────────────────────────

  async function nextStep() {
    if (step === 1) {
      const valid = await form1.trigger()
      if (!valid) return
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

  // ── Final submit ─────────────────────────────────────────────────────────

  async function onSubmit(step3: Step3Values) {
    setServerError(null)
    const s1 = form1.getValues()
    const s2 = form2.getValues()

    const payload = {
      email: s1.email,
      password: s1.password,
      display_name: s1.display_name,
      username: s1.username,
      account_type: step3.account_type,
      bio: s2.bio || undefined,
      location: s2.location || undefined,
      skills: skills.length > 0 ? skills : undefined,
      website_url: s2.website_url || undefined,
      github_url: s2.github_url || undefined,
      linkedin_url: s2.linkedin_url || undefined,
      twitter_url: s2.twitter_url || undefined,
    }

    try {
      await authApi.register(payload)
      await refreshSession()
      router.push(step3.account_type === "organizer" ? "/org/dashboard" : "/dashboard")
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          const code = (err.body as { code?: string }).code
          if (code === "email_taken") {
            setServerError("Email already registered.")
            setFocusField("email")
            setStep(1)
            return
          }
          if (code === "username_taken") {
            setServerError("Username already taken.")
            setFocusField("username")
            setStep(1)
            return
          }
        }
        setServerError("Something went wrong. Please try again.")
      }
    }
  }

  // ── Skill tag helpers ────────────────────────────────────────────────────

  function addSkill() {
    const trimmed = skillInput.trim()
    if (trimmed && !skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed])
    }
    setSkillInput("")
  }

  function removeSkill(skill: string) {
    setSkills((prev) => prev.filter((s) => s !== skill))
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={`w-6 h-6 rounded-full text-xs font-medium flex items-center justify-center shrink-0 ${
                  step > n
                    ? "bg-primary text-primary-foreground"
                    : step === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {n}
              </div>
              <span
                className={`text-xs hidden sm:block ${step === n ? "text-foreground font-medium" : "text-muted-foreground"}`}
              >
                {label}
              </span>
              {i < 2 && <div className="flex-1 h-px bg-border" />}
            </div>
          )
        })}
      </div>

      {serverError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <span>{serverError}</span>
          {focusField && (
            <button
              type="button"
              onClick={() => { setServerError(null); setFocusField(null) }}
              className="ml-auto underline shrink-0"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {/* Step 1 — Account details */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email *</label>
            <input
              type="email"
              autoComplete="email"
              autoFocus={focusField === "email"}
              {...form1.register("email")}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {form1.formState.errors.email && (
              <p className="text-xs text-destructive">{form1.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Password *</label>
            <input
              type="password"
              autoComplete="new-password"
              {...form1.register("password")}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
            {form1.formState.errors.password && (
              <p className="text-xs text-destructive">{form1.formState.errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Display name *</label>
            <input
              type="text"
              autoComplete="name"
              {...form1.register("display_name")}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {form1.formState.errors.display_name && (
              <p className="text-xs text-destructive">{form1.formState.errors.display_name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Username *</label>
            <div className="relative">
              <input
                type="text"
                autoComplete="username"
                autoFocus={focusField === "username"}
                {...form1.register("username")}
                onChange={handleUsernameChange}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {usernameChecking && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">…</span>
              )}
              {!usernameChecking && usernameAvailable === true && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-green-600">✓ available</span>
              )}
              {!usernameChecking && usernameAvailable === false && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-destructive">✗ taken</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">3–30 chars · lowercase letters, numbers, - and _</p>
            {form1.formState.errors.username && (
              <p className="text-xs text-destructive">{form1.formState.errors.username.message}</p>
            )}
          </div>

          <button
            type="button"
            onClick={nextStep}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Continue →
          </button>
        </div>
      )}

      {/* Step 2 — Profile info (all optional) */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Avatar — disabled in Phase 1 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Avatar (optional)</label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xl">
                ?
              </div>
              <p className="text-xs text-muted-foreground">Avatar upload available soon</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Bio (optional)</label>
            <textarea
              {...form2.register("bio")}
              placeholder="Tell others what you do · max 500 chars"
              maxLength={500}
              rows={3}
              className="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Location (optional)</label>
            <input
              type="text"
              {...form2.register("location")}
              placeholder="e.g. Mumbai, India"
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Skills (optional)</label>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {skills.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs">
                  {s}
                  <button type="button" onClick={() => removeSkill(s)} className="hover:text-destructive">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill() } }}
                placeholder="e.g. Python, LLMs · press Enter to add"
                className="flex h-9 flex-1 rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={addSkill}
                className="inline-flex items-center justify-center rounded-md border px-3 py-1 text-sm hover:bg-accent transition-colors"
              >
                + Add
              </button>
            </div>
          </div>

          {(["website_url", "github_url", "linkedin_url", "twitter_url"] as const).map((field) => {
            const placeholders: Record<string, string> = {
              website_url: "https://yoursite.com",
              github_url: "https://github.com/username",
              linkedin_url: "https://linkedin.com/in/username",
              twitter_url: "https://x.com/username",
            }
            const labels: Record<string, string> = {
              website_url: "Website",
              github_url: "GitHub",
              linkedin_url: "LinkedIn",
              twitter_url: "Twitter / X",
            }
            return (
              <div key={field} className="space-y-1.5">
                <label className="text-sm font-medium">{labels[field]} (optional)</label>
                <input
                  type="url"
                  {...form2.register(field)}
                  placeholder={placeholders[field]}
                  className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {form2.formState.errors[field] && (
                  <p className="text-xs text-destructive">{form2.formState.errors[field]?.message}</p>
                )}
              </div>
            )
          })}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={nextStep}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Account type */}
      {step === 3 && (
        <form onSubmit={form3.handleSubmit(onSubmit)} className="space-y-4">
          <p className="text-sm text-muted-foreground">Choose how you&apos;ll use Bounty Board:</p>

          <div className="grid grid-cols-2 gap-3">
            {(["organizer", "participant"] as const).map((type) => {
              const selected = form3.watch("account_type") === type
              return (
                <label
                  key={type}
                  className={`cursor-pointer rounded-lg border-2 p-4 space-y-2 transition-colors ${
                    selected ? "border-primary bg-accent" : "border-border hover:border-primary/50"
                  }`}
                >
                  <input
                    type="radio"
                    value={type}
                    {...form3.register("account_type")}
                    className="sr-only"
                  />
                  <p className="font-medium text-sm">
                    {type === "organizer" ? "🏢 Organizer" : "🎯 Participant"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {type === "organizer"
                      ? "I create and manage bounties for my team or organisation"
                      : "I solve bounties and compete on the leaderboard"}
                  </p>
                </label>
              )
            })}
          </div>

          {form3.formState.errors.account_type && (
            <p className="text-xs text-destructive">Please select an account type</p>
          )}

          <button
            type="submit"
            disabled={form3.formState.isSubmitting}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {form3.formState.isSubmitting ? "Creating account…" : "Create Account"}
          </button>
        </form>
      )}
    </div>
  )
}
