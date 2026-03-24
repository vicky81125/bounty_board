import { getServerSession } from "@/lib/server-auth"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Welcome back, {session.user.display_name}</h1>
      <p className="text-muted-foreground">
        Browse open bounties, track your submissions, and climb the leaderboard.
      </p>
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Bounty listings coming in Phase 2
      </div>
    </div>
  )
}
