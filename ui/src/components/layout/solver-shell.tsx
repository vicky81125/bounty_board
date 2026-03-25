"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LogOut, Target } from "lucide-react"
import { useAuth } from "@/providers/auth-provider"
import type { AuthUser } from "@/lib/auth"

interface SolverShellProps {
  user: AuthUser
  children: React.ReactNode
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("")
}

function UserMenu({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="User menu"
      >
        <div className="h-8 w-8 rounded-full bg-white text-black border-2 border-white/20 flex items-center justify-center text-xs font-semibold select-none">
          {getInitials(user.display_name)}
        </div>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 rounded-lg border bg-white shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-sm font-medium truncate">{user.display_name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <button
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
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
      <header className="sticky top-0 z-50 w-full bg-black">
        <div className="mx-auto w-full max-w-5xl px-6 flex h-14 items-center">
          <Link href="/bounties" className="flex items-center gap-2 font-bold mr-8 text-white">
            <Target className="h-5 w-5 text-white" />
            <span>Bounty Board</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm flex-1">
            <Link
              href="/bounties"
              className="text-white/70 hover:text-white transition-colors"
            >
              Bounties
            </Link>
            <Link
              href="/leaderboard"
              className="text-white/70 hover:text-white transition-colors"
            >
              Leaderboard
            </Link>
          </nav>

          <div className="ml-auto">
            <UserMenu user={user} onSignOut={handleSignOut} />
          </div>
        </div>
      </header>

      <main className="flex-1 py-8">
        <div className="mx-auto w-full max-w-5xl px-6">
          {children}
        </div>
      </main>
    </div>
  )
}
