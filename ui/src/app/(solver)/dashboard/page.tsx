import { getServerSession } from "@/lib/server-auth"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await getServerSession()
  if (!session) redirect("/login")
  redirect("/bounties")
}
