export type AccountType = "organizer" | "participant"

export type AuthUser = {
  id: string
  email: string
  username: string
  display_name: string
  account_type: AccountType
  avatar_url: string | null
}

export type SessionResponse = {
  user: AuthUser
  session_expires_at: string
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated"
