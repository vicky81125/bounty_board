"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, Menu, Trophy, Target } from "lucide-react"
import { useAuth } from "@/providers/auth-provider"
import type { AuthUser } from "@/lib/auth"

interface SolverShellProps {
  user: AuthUser
  children: React.ReactNode
}

export function SolverShell({ user, children }: SolverShellProps) {
  const { signOut } = useAuth()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.push("/login")
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top navigation bar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold mr-8">
            <Target className="h-5 w-5" />
            <span>Bounty Board</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm flex-1">
            <Link href="/bounties" className="text-muted-foreground hover:text-foreground transition-colors">
              Bounties
            </Link>
            <Link href="/leaderboard" className="text-muted-foreground hover:text-foreground transition-colors">
              Leaderboard
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user.display_name}</span>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-6">{children}</main>
    </div>
  )
}
