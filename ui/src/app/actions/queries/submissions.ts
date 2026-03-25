import 'server-only'
import { requireAuth, requireOrgMember } from '../_auth'

export async function getMySubmission(bountyId: string) {
  const auth = await requireAuth()
  if (!auth.ok) return { error: auth.error }

  const { data, error } = await auth.admin
    .from('submissions')
    .select('*, submission_scores(*)')
    .eq('bounty_id', bountyId)
    .eq('user_id', auth.user.id)
    .not('status', 'eq', 'upload_pending')
    .maybeSingle()

  if (error) return { error: error.message }
  return { data }
}

export async function getMyBountySubmissions(bountyId: string) {
  const auth = await requireAuth()
  if (!auth.ok) return { error: auth.error }

  const { data, error } = await auth.admin
    .from('submissions')
    .select('*, submission_scores(*)')
    .eq('bounty_id', bountyId)
    .eq('user_id', auth.user.id)
    .not('status', 'eq', 'upload_pending')
    .order('submitted_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

export async function getMySubmissions() {
  const auth = await requireAuth()
  if (!auth.ok) return { error: auth.error }

  const { data, error } = await auth.admin
    .from('submissions')
    .select('*, bounties!inner(id, title, org_id, orgs!inner(name))')
    .eq('user_id', auth.user.id)
    .not('status', 'eq', 'upload_pending')
    .order('submitted_at', { ascending: false })

  if (error) return { error: error.message }
  return { data: data ?? [] }
}

export async function getOrgSubmissions(
  bountyId: string,
  orgId: string,
  statusFilter?: string
) {
  const auth = await requireOrgMember(orgId)
  if (!auth.ok) return { error: auth.error }

  let query = auth.admin
    .from('submissions')
    .select('*, profiles!inner(username, display_name, avatar_url, email), submission_scores(*)')
    .eq('bounty_id', bountyId)
    .not('status', 'eq', 'upload_pending')
    .order('submitted_at', { ascending: false })

  if (statusFilter) {
    query = query.eq('status', statusFilter)
  }

  const { data, error } = await query
  if (error) return { error: error.message }
  return { data: data ?? [] }
}

export async function getSubmission(submissionId: string, orgId: string) {
  const auth = await requireOrgMember(orgId)
  if (!auth.ok) return { error: auth.error }

  const { data, error } = await auth.admin
    .from('submissions')
    .select('*, profiles!inner(username, display_name, avatar_url, email), submission_scores(*)')
    .eq('id', submissionId)
    .single()

  if (error) return { error: error.message }
  return { data }
}
