"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { apiRequest } from "@/lib/api"

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
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "moderator">("moderator")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError(null)
    setInviting(true)
    try {
      await apiRequest(`/orgs/${orgId}/members`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      setInviteEmail("")
      setShowInvite(false)
      router.refresh()
    } catch (err: any) {
      setInviteError(err?.body?.detail ?? "Failed to invite member")
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(userId: string, newRole: "admin" | "moderator") {
    try {
      await apiRequest(`/orgs/${orgId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      })
      router.refresh()
    } catch (err: any) {
      alert(err?.body?.detail ?? "Failed to update role")
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this org? They will lose access immediately.`)) return
    try {
      await apiRequest(`/orgs/${orgId}/members/${userId}`, { method: "DELETE" })
      router.refresh()
    } catch (err: any) {
      alert(err?.body?.detail ?? "Failed to remove member")
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          onClick={() => setShowInvite(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Invite Member
        </button>
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border shadow-lg p-6 w-full max-w-sm space-y-4">
            <h2 className="text-lg font-semibold">Invite Member</h2>
            {inviteError && (
              <p className="text-sm text-destructive">{inviteError}</p>
            )}
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
                  disabled={inviting}
                  className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {inviting ? "Inviting…" : "Invite"}
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

      {/* Members table */}
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
                    onChange={(e) =>
                      handleRoleChange(m.user_id, e.target.value as "admin" | "moderator")
                    }
                    className="rounded border px-2 py-1 text-xs bg-background"
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
                      className="text-xs text-destructive hover:underline"
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
