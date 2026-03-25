"use client"

import { createContext, useCallback, useContext } from "react"
import { createClient } from "@/lib/supabase/browser"
import type { AuthStatus, AuthUser } from "@/lib/auth"

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  sessionExpiresAt: Date | null
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const signOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Caller handles navigation (e.g. router.push('/login'))
  }, [])

  // Session refresh is handled automatically by @supabase/ssr middleware
  const refreshSession = useCallback(async () => {}, [])

  return (
    <AuthContext.Provider
      value={{
        status: "authenticated",
        user: null,
        sessionExpiresAt: null,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
