import { redirect } from "next/navigation"
import { getBounty } from "@/app/actions/queries/bounties"
import { EditBountyClient } from "./edit-bounty-client"

interface Props {
  params: Promise<{ orgId: string; bountyId: string }>
}

export default async function EditBountyPage({ params }: Props) {
  const { orgId, bountyId } = await params

  const result = await getBounty(bountyId)
  if (result.error || !result.data) redirect(`/org/${orgId}/bounties`)

  const bounty = result.data as any
  // Ensure bounty belongs to this org
  if (bounty.org_id !== orgId) redirect(`/org/${orgId}/bounties`)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Edit Bounty</h1>
      <EditBountyClient bounty={bounty} orgId={orgId} />
    </div>
  )
}
