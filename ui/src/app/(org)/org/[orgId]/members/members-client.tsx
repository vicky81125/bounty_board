"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { inviteMember, updateMemberRole, removeMember } from "@/app/actions/mutations/orgs"

interface Member {
  user_id: string
  display_name: string
  email: string
  role: "admin" | "moderator"
  joined_at: string
}

interface Props {
  members: Member[]
  orgId: string
  currentUserId: string
}

export function MembersClient({ members, orgId, currentUserId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "moderator">("moderator")
  const [inviteError, setInviteError] = useState<string | null>(null)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError(null)
    startTransition(async () => {
      const result = await inviteMember(orgId, inviteEmail, inviteRole)
      if (result?.error) {
        setInviteError(result.error)
      } else {
        setInviteEmail("")
        setShowInvite(false)
        router.refresh()
      }
    })
  }

  function handleRoleChange(userId: string, newRole: "admin" | "moderator") {
    startTransition(async () => {
      const result = await updateMemberRole(orgId, userId, newRole)
      if (result?.error) alert(result.error)
      else router.refresh()
    })
  }

  function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this org? They will lose access immediately.`)) return
    startTransition(async () => {
      const result = await removeMember(orgId, userId)
      if (result?.error) alert(result.error)
      else router.refresh()
    })
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-lg btn-pink px-6 py-2 text-sm"
        >
          Invite Member
        </button>
      </div>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold">Invite Member</h2>
            {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Role</label>
                <div className="flex gap-3">
                  {(["admin", "moderator"] as const).map((r) => (
                    <label key={r} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="role"
                        value={r}
                        checked={inviteRole === r}
                        onChange={() => setInviteRole(r)}
                      />
                      <span className="capitalize">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-lg btn-pink px-3 py-2 text-sm disabled:opacity-50"
                >
                  {isPending ? "Inviting…" : "Invite"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInviteError(null) }}
                  className="flex-1 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Joined</th>
              <th className="px-4 py-3 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => (
              <tr key={m.user_id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{m.display_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.user_id, e.target.value as "admin" | "moderator")}
                    disabled={isPending}
                    className="rounded border px-2 py-1 text-xs bg-background disabled:opacity-50"
                  >
                    <option value="admin">Admin</option>
                    <option value="moderator">Moderator</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(m.joined_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {m.user_id !== currentUserId && (
                    <button
                      onClick={() => handleRemove(m.user_id, m.display_name)}
                      disabled={isPending}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
