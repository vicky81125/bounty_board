"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { AuthStatus, AuthUser, SessionResponse } from "@/lib/auth"
import { authApi } from "@/lib/api"

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  sessionExpiresAt: Date | null
  signIn: (email: string, password: string) => Promise<SessionResponse>
  signOut: () => Promise<void>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}

function applySessionData(
  data: SessionResponse,
  setUser: (u: AuthUser) => void,
  setSessionExpiresAt: (d: Date) => void,
  setStatus: (s: AuthStatus) => void,
) {
  setUser(data.user)
  setSessionExpiresAt(new Date(data.session_expires_at))
  setStatus("authenticated")
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [user, setUser] = useState<AuthUser | null>(null)
  const [sessionExpiresAt, setSessionExpiresAt] = useState<Date | null>(null)
  const hasHydrated = useRef(false)

  const refreshSession = useCallback(async () => {
    try {
      const data = await authApi.session() as SessionResponse
      applySessionData(data, setUser, setSessionExpiresAt, setStatus)
    } catch {
      setUser(null)
      setSessionExpiresAt(null)
      setStatus("unauthenticated")
    }
  }, [])

  // Hydrate session on mount
  useEffect(() => {
    if (hasHydrated.current) return
    hasHydrated.current = true
    refreshSession()
  }, [refreshSession])

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password) as SessionResponse
    applySessionData(data, setUser, setSessionExpiresAt, setStatus)
    return data
  }, [])

  const signOut = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setSessionExpiresAt(null)
      setStatus("unauthenticated")
    }
  }, [])

  return (
    <AuthContext.Provider value={{ status, user, sessionExpiresAt, signIn, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  )
}
