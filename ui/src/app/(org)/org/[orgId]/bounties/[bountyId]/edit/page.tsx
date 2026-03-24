import { redirect } from "next/navigation"
import { serverFetch } from "@/lib/server-api"
import { EditBountyClient } from "./edit-bounty-client"

interface Props {
  params: Promise<{ orgId: string; bountyId: string }>
}

export default async function EditBountyPage({ params }: Props) {
  const { orgId, bountyId } = await params

  // Fetch the bounty via the org-scoped endpoint (validates membership via layout)
  const bounties = await serverFetch<any[]>(`/orgs/${orgId}/bounties`)
  const bounty = bounties?.find((b: any) => b.id === bountyId)
  if (!bounty) redirect(`/org/${orgId}/bounties`)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Edit Bounty</h1>
      <EditBountyClient bounty={bounty} orgId={orgId} />
    </div>
  )
}
