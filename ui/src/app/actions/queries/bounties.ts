import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMember } from '../_auth'

export async function getBounties(filters: {
  search?: string
  status?: string
  difficulty?: string
  tags?: string
  sort?: string
  page?: number
  pageSize?: number
}) {
  const supabase = await createClient()
  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 20
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('bounties')
    .select(
      `id, title, difficulty, tags, status, end_date, created_at,
       prize, max_submissions_per_user,
       orgs!inner(name),
       submissions(count)`,
      { count: 'exact' }
    )
    .neq('status', 'draft')  // never show drafts on public listing

  if (filters.search) {
    query = query.textSearch('search_vector', filters.search, { type: 'websearch' })
  }
  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.difficulty) {
    query = query.eq('difficulty', filters.difficulty)
  }
  if (filters.tags) {
    query = query.overlaps('tags', filters.tags.split(','))
  }

  const sortMap: Record<string, string> = {
    newest: 'created_at',
    oldest: 'created_at',
    end_date: 'end_date',
  }
  const sortCol = sortMap[filters.sort ?? ''] ?? 'created_at'
  const ascending = filters.sort === 'oldest'
  query = query.order(sortCol, { ascending, nullsFirst: false })

  query = query.range(offset, offset + pageSize - 1)

  const { data, count, error } = await query
  if (error) return { error: error.message }

  const items = (data ?? []).map((b: any) => ({
    id: b.id,
    title: b.title,
    org_name: b.orgs?.name ?? '',
    prize_summary: b.prize
      ? b.prize.type === 'tiered'
        ? `$${(b.prize.tiers ?? []).reduce((s: number, t: any) => s + (t.amount ?? 0), 0)} total`
        : `$${b.prize.amount}`
      : null,
    difficulty: b.difficulty,
    tags: b.tags ?? [],
    status: b.status,
    end_date: b.end_date,
    submission_count: b.submissions?.[0]?.count ?? 0,
    created_at: b.created_at,
  }))

  return {
    data: {
      items,
      total: count ?? 0,
      page,
      page_size: pageSize,
    },
  }
}

export async function getBounty(bountyId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bounties')
    .select(`*, orgs!inner(id, name, slug)`)
    .eq('id', bountyId)
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function getOrgBounties(orgId: string) {
  const auth = await requireOrgMember(orgId)
  if (!auth.ok) return { error: auth.error }

  const { data, error } = await auth.admin
    .from('bounties')
    .select('*, submissions(count)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: data ?? [] }
}
