'use server'
import { requireOrgMember } from '../_auth'

type BountyInput = {
  title: string
  description_md?: string
  ideal_output_md?: string
  start_date?: string | null
  end_date?: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  tags?: string[]
  skills_required?: unknown[]
  submission_formats: string[]
  rubric: Array<{ criterion: string; max_points: number }>
  prize?: unknown
  resources?: unknown[]
  eligibility_notes?: string
  max_submissions_per_user?: number | null
  status?: 'draft' | 'open'
}

function validateBountyInput(data: BountyInput) {
  if (!data.title?.trim()) return 'Title is required'
  if (!data.rubric || data.rubric.length === 0) return 'Rubric must have at least 1 criterion'
  const totalMax = data.rubric.reduce((s, c) => s + (c.max_points ?? 0), 0)
  if (totalMax <= 0) return 'Rubric total max_points must be > 0'
  if (!data.submission_formats || data.submission_formats.length === 0) {
    return 'At least one submission format is required'
  }
  if (data.start_date && data.end_date && data.end_date <= data.start_date) {
    return 'end_date must be after start_date'
  }
  return null
}

export async function createBounty(orgId: string, data: BountyInput) {
  const auth = await requireOrgMember(orgId, 'admin')
  if (!auth.ok) return { error: auth.error }

  const validationError = validateBountyInput(data)
  if (validationError) return { error: validationError }

  const { data: bounty, error } = await auth.admin
    .from('bounties')
    .insert({
      org_id: orgId,
      created_by: auth.user.id,
      title: data.title.trim(),
      description_md: data.description_md ?? '',
      ideal_output_md: data.ideal_output_md ?? '',
      start_date: data.start_date ?? null,
      end_date: data.end_date ?? null,
      difficulty: data.difficulty,
      tags: data.tags ?? [],
      skills_required: data.skills_required ?? [],
      submission_formats: data.submission_formats,
      rubric: data.rubric,
      prize: data.prize ?? null,
      resources: data.resources ?? [],
      eligibility_notes: data.eligibility_notes ?? null,
      max_submissions_per_user: data.max_submissions_per_user ?? null,
      status: data.status ?? 'draft',
    })
    .select('id, slug:id')  // use id as reference
    .single()

  if (error) return { error: error.message }
  return { data: bounty }
}

export async function updateBounty(bountyId: string, orgId: string, data: Partial<BountyInput>) {
  const auth = await requireOrgMember(orgId)
  if (!auth.ok) return { error: auth.error }
  if (auth.memberRole !== 'admin' && auth.memberRole !== 'moderator') {
    return { error: 'Forbidden: admin or moderator required' }
  }

  if (data.rubric !== undefined || data.submission_formats !== undefined) {
    const validationError = validateBountyInput(data as BountyInput)
    if (validationError) return { error: validationError }
  }

  const { error } = await auth.admin
    .from('bounties')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', bountyId)
    .eq('org_id', orgId)

  if (error) return { error: error.message }
  return { data: { success: true } }
}

export async function deleteBounty(bountyId: string, orgId: string) {
  const auth = await requireOrgMember(orgId, 'admin')
  if (!auth.ok) return { error: auth.error }

  const { data: bounty } = await auth.admin
    .from('bounties')
    .select('status')
    .eq('id', bountyId)
    .single()

  if (!bounty) return { error: 'Bounty not found' }
  if (bounty.status !== 'draft') return { error: 'Only draft bounties can be deleted' }

  const { error } = await auth.admin
    .from('bounties')
    .delete()
    .eq('id', bountyId)

  if (error) return { error: error.message }
  return { data: { success: true } }
}

export async function changeBountyStatus(
  bountyId: string,
  orgId: string,
  newStatus: 'open' | 'closed'
) {
  const auth = await requireOrgMember(orgId, 'admin')
  if (!auth.ok) return { error: auth.error }

  const { data: bounty } = await auth.admin
    .from('bounties')
    .select('status')
    .eq('id', bountyId)
    .single()

  if (!bounty) return { error: 'Bounty not found' }
  if (bounty.status === 'closed') {
    return { error: 'Closed bounties cannot be reopened' }
  }

  const { error } = await auth.admin
    .from('bounties')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', bountyId)

  if (error) return { error: error.message }
  return { data: { success: true } }
}
