import { Suspense } from "react"
import { serverFetch } from "@/lib/server-api"
import { BountyCard } from "@/components/bounty-card"
import { BountyFilters } from "./bounty-filters"
import Link from "next/link"

interface BountyCardData {
  id: string
  title: string
  org_name: string
  prize_summary: string | null
  difficulty: "easy" | "medium" | "hard"
  tags: string[]
  status: "open" | "closed"
  end_date: string | null
  submission_count: number | null
  created_at: string
}

interface ListResponse {
  items: BountyCardData[]
  total: number
  page: number
  page_size: number
}

interface Props {
  searchParams: Promise<{
    search?: string
    status?: string
    difficulty?: string
    tags?: string
    sort?: string
    page?: string
  }>
}

export default async function BountiesPage({ searchParams }: Props) {
  const sp = await searchParams
  const params = new URLSearchParams()
  if (sp.search) params.set("search", sp.search)
  if (sp.status) params.set("status", sp.status)
  if (sp.difficulty) params.set("difficulty", sp.difficulty)
  if (sp.tags) params.set("tags", sp.tags)
  if (sp.sort) params.set("sort", sp.sort)
  if (sp.page) params.set("page", sp.page)

  const qs = params.toString()
  const data = await serverFetch<ListResponse>(`/bounties${qs ? `?${qs}` : ""}`)
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = Number(sp.page ?? 1)
  const pageSize = 20

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bounties</h1>

      <Suspense fallback={null}>
        <BountyFilters
          search={sp.search}
          status={sp.status}
          difficulty={sp.difficulty}
          tags={sp.tags}
          sort={sp.sort}
        />
      </Suspense>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No bounties found.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((b) => (
              <BountyCard
                key={b.id}
                id={b.id}
                title={b.title}
                orgName={b.org_name}
                prizeSummary={b.prize_summary}
                difficulty={b.difficulty}
                tags={b.tags}
                status={b.status}
                endDate={b.end_date}
                submissionCount={b.submission_count}
              />
            ))}
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <PaginationLink
                    sp={sp}
                    page={page - 1}
                    label="← Previous"
                  />
                )}
                {page * pageSize < total && (
                  <PaginationLink
                    sp={sp}
                    page={page + 1}
                    label="Next →"
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PaginationLink({
  sp,
  page,
  label,
}: {
  sp: Record<string, string | undefined>
  page: number
  label: string
}) {
  const p = new URLSearchParams()
  Object.entries(sp).forEach(([k, v]) => { if (v) p.set(k, v) })
  p.set("page", String(page))
  return (
    <Link
      href={`/bounties?${p.toString()}`}
      className="rounded-md border px-3 py-1 hover:bg-muted transition-colors"
    >
      {label}
    </Link>
  )
}
