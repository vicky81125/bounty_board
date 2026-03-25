'use server'
import { requireAuth, requireOrgMember } from '../_auth'

const SLUG_RE = /^[a-z0-9-]{3,40}$/

export async function createOrg(data: { name: string; slug: string }) {
  const auth = await requireAuth()
  if (!auth.ok) return { error: auth.error }
  if (auth.profile.account_type !== 'organizer') {
    return { error: 'Only organizer accounts can create organisations' }
  }

  const name = data.name.trim()
  const slug = data.slug.trim().toLowerCase()

  if (!name || !slug) return { error: 'Name and slug are required' }
  if (!SLUG_RE.test(slug)) {
    return { error: 'Slug must be 3–40 lowercase letters, numbers, or hyphens' }
  }

  // Check slug uniqueness
  const { data: existing } = await auth.admin
    .from('orgs')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) return { error: 'Slug already taken' }

  const { data: org, error } = await auth.admin
    .from('orgs')
    .insert({ name, slug, created_by: auth.user.id })
    .select('id, slug')
    .single()

  if (error) return { error: error.message }

  // Add creator as admin
  await auth.admin.from('org_members').insert({
    org_id: org.id,
    user_id: auth.user.id,
    role: 'admin',
  })

  return { data: org }
}

export async function inviteMember(
  orgId: string,
  email: string,
  role: 'admin' | 'moderator'
) {
  const auth = await requireOrgMember(orgId, 'admin')
  if (!auth.ok) return { error: auth.error }

  const inviteeEmail = email.trim().toLowerCase()

  // Invitee must be an existing organizer account
  const { data: invitee } = await auth.admin
    .from('profiles')
    .select('id, account_type')
    .eq('email', inviteeEmail)
    .single()

  if (!invitee) return { error: 'No account found with that email' }
  if (invitee.account_type !== 'organizer') {
    return { error: 'Only organizer accounts can be org members' }
  }

  // Check not already a member
  const { data: existing } = await auth.admin
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('user_id', invitee.id)
    .maybeSingle()

  if (existing) return { error: 'User is already a member of this organisation' }

  const { error } = await auth.admin
    .from('org_members')
    .insert({ org_id: orgId, user_id: invitee.id, role })

  if (error) return { error: error.message }
  return { data: { success: true } }
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  newRole: 'admin' | 'moderator'
) {
  const auth = await requireOrgMember(orgId, 'admin')
  if (!auth.ok) return { error: auth.error }

  // Last-admin guard
  if (newRole !== 'admin') {
    const { count } = await auth.admin
      .from('org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'admin')

    const { data: target } = await auth.admin
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .single()

    if (target?.role === 'admin' && (count ?? 0) <= 1) {
      return { error: 'Cannot demote the last admin' }
    }
  }

  const { error } = await auth.admin
    .from('org_members')
    .update({ role: newRole })
    .eq('org_id', orgId)
    .eq('user_id', userId)

  if (error) return { error: error.message }
  return { data: { success: true } }
}

export async function removeMember(orgId: string, userId: string) {
  const auth = await requireOrgMember(orgId, 'admin')
  if (!auth.ok) return { error: auth.error }

  // Last-admin guard
  const { data: target } = await auth.admin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .single()

  if (target?.role === 'admin') {
    const { count } = await auth.admin
      .from('org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'admin')

    if ((count ?? 0) <= 1) {
      return { error: 'Cannot remove the last admin' }
    }
  }

  const { error } = await auth.admin
    .from('org_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId)

  if (error) return { error: error.message }
  return { data: { success: true } }
}
