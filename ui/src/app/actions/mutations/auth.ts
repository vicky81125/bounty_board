'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { safeRedirect } from '@/lib/utils/safe-redirect'

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/

type SignUpData = {
  email: string
  password: string
  username: string
  display_name: string
  account_type: 'organizer' | 'participant'
  bio?: string
  location?: string
  skills?: string[]
  website_url?: string
  github_url?: string
  linkedin_url?: string
  twitter_url?: string
}

export async function signUp(data: SignUpData) {
  const email = data.email.trim().toLowerCase()
  const password = data.password
  const username = data.username.trim().toLowerCase()
  const displayName = data.display_name.trim()
  const accountType = data.account_type

  if (!email || !password || !username || !displayName) {
    return { error: 'All fields are required' }
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' }
  }
  if (!USERNAME_RE.test(username)) {
    return { error: 'Username must be 3–30 lowercase letters, numbers, hyphens, or underscores' }
  }
  if (!['organizer', 'participant'].includes(accountType)) {
    return { error: 'Invalid account type' }
  }

  const supabase = await createClient()

  // Check username uniqueness before creating auth user
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (existing) return { error: 'Username already taken' }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: {
        username,
        display_name: displayName,
        account_type: accountType,
        ...(data.bio && { bio: data.bio }),
        ...(data.location && { location: data.location }),
        ...(data.skills?.length && { skills: data.skills }),
        ...(data.website_url && { website_url: data.website_url }),
        ...(data.github_url && { github_url: data.github_url }),
        ...(data.linkedin_url && { linkedin_url: data.linkedin_url }),
        ...(data.twitter_url && { twitter_url: data.twitter_url }),
      },
    },
  })

  if (error) return { error: error.message }

  return { success: 'Check your email to confirm your account before signing in.' }
}

export async function signIn(email: string, password: string, next?: string) {
  const safeNext = safeRedirect(next)
  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail || !password) return { error: 'Email and password are required' }

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error || !user) return { error: 'Invalid email or password' }

  // Revoke all other sessions (session fixation prevention)
  await supabase.auth.signOut({ scope: 'others' })

  // Redirect based on account_type if no explicit next param
  if (safeNext === '/') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', user.id)
      .single()
    redirect(profile?.account_type === 'organizer' ? '/org/dashboard' : '/dashboard')
  }

  redirect(safeNext)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function checkUsername(username: string) {
  if (!username || !USERNAME_RE.test(username)) {
    return { available: false, error: 'Invalid username format' }
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username.toLowerCase())
    .maybeSingle()

  return { available: !data }
}
