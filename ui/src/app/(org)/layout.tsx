import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single()

  if (!profile || profile.account_type === "participant") redirect("/dashboard")
  return <>{children}</>
}
