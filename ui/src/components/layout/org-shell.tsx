"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePathname } from "next/navigation"
import { Building2, LayoutDashboard, ListTodo, LogOut, Trophy, Users } from "lucide-react"
import { useAuth } from "@/providers/auth-provider"
import type { AuthUser } from "@/lib/auth"
import { cn } from "@/lib/utils"

interface OrgShellProps {
  user: AuthUser
  children: React.ReactNode
  orgId?: string
  orgRole?: "admin" | "moderator"
}

export function OrgShell({ user, children, orgId, orgRole }: OrgShellProps) {
  const { signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    await signOut()
    router.push("/login")
  }

  const navItems = orgId
    ? [
        { href: `/org/${orgId}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
        { href: `/org/${orgId}/bounties`, label: "Bounties", icon: ListTodo },
        { href: `/org/${orgId}/submissions`, label: "Submissions", icon: ListTodo },
        { href: `/org/${orgId}/leaderboard`, label: "Leaderboard", icon: Trophy },
        { href: `/org/${orgId}/members`, label: "Members", icon: Users, adminOnly: true },
      ]
    : [
        { href: "/org/dashboard", label: "Dashboard", icon: LayoutDashboard },
      ]

  const visibleItems = navItems.filter(
    ({ adminOnly }) => !adminOnly || orgRole === "admin"
  )

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 bg-black flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10">
          <Link
            href={orgId ? `/org/${orgId}/dashboard` : "/org/dashboard"}
            className="flex items-center gap-2 font-bold text-white"
          >
            <Building2 className="h-5 w-5 text-white" />
            <span>Bounty Board</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {visibleItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                pathname.startsWith(href)
                  ? "bg-white/10 text-white font-semibold"
                  : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2">
          <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
          <p className="text-xs text-white/60 truncate">{user.email}</p>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors w-full mt-1"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-10 py-8">{children}</div>
      </main>
    </div>
  )
}
