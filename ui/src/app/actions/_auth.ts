import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { User } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Profile = {
  id: string
  email: string
  username: string
  display_name: string
  account_type: 'organizer' | 'participant'
  avatar_url: string | null
  bio: string | null
  location: string | null
  skills: string[]
  website_url: string | null
  github_url: string | null
  linkedin_url: string | null
  twitter_url: string | null
  is_active: boolean
  global_score: number
  created_at: string
  updated_at: string
}

type AuthOk = {
  ok: true
  user: User
  profile: Profile
  admin: SupabaseClient
}
type AuthFail = { ok: false; error: string }
export type AuthResult = AuthOk | AuthFail

/**
 * Requires an authenticated, active user.
 * Returns discriminated union — never throws.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return { ok: false, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) return { ok: false, error: 'Profile not found' }
  if (!profile.is_active) return { ok: false, error: 'Account disabled' }

  const admin = createAdminClient()
  return { ok: true, user, profile: profile as Profile, admin }
}

/**
 * Requires an authenticated user who is an org admin or moderator.
 */
export async function requireOrgMember(
  orgId: string,
  role: 'admin' | 'moderator' | 'any' = 'any'
): Promise<AuthResult & { memberRole?: string }> {
  const auth = await requireAuth()
  if (!auth.ok) return auth

  const { data: membership } = await auth.admin
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', auth.user.id)
    .single()

  if (!membership) return { ok: false, error: 'Forbidden: not an org member' }
  if (role === 'admin' && membership.role !== 'admin') {
    return { ok: false, error: 'Forbidden: admin required' }
  }

  return { ...auth, memberRole: membership.role }
}
