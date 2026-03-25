"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { BOUNTY_TAGS } from "@/lib/constants"

interface Props {
  search?: string
  status?: string
  difficulty?: string
  tags?: string
  sort?: string
}

export function BountyFilters({ search, status, difficulty, tags, sort }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const update = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(sp.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete("page")
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, sp]
  )

  const selectedTags = tags ? tags.split(",") : []

  function toggleTag(tag: string) {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag]
    update("tags", next.length > 0 ? next.join(",") : undefined)
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        type="search"
        defaultValue={search}
        placeholder="Search bounties…"
        onChange={(e) => {
          const val = e.target.value
          const t = setTimeout(() => update("search", val || undefined), 300)
          return () => clearTimeout(t)
        }}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
      />

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 text-sm">
        {/* Status */}
        <select
          value={status ?? ""}
          onChange={(e) => update("status", e.target.value || undefined)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm bg-card"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>

        {/* Difficulty */}
        <select
          value={difficulty ?? ""}
          onChange={(e) => update("difficulty", e.target.value || undefined)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm bg-card"
        >
          <option value="">Any difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        {/* Sort */}
        <select
          value={sort ?? "newest"}
          onChange={(e) => update("sort", e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm bg-card"
        >
          <option value="newest">Newest first</option>
          <option value="deadline">Deadline</option>
        </select>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {BOUNTY_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggleTag(tag)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
              selectedTags.includes(tag)
                ? "bg-black text-white border-black"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}
