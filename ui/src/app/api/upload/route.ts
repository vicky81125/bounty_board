import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/actions/_auth'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ALLOWED_ORIGINS = new Set(
  [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
  ].filter(Boolean)
)

export async function POST(req: NextRequest) {
  // Origin check — prevents CSRF on the upload token endpoint
  const origin = req.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Body size guard — upload-url request should be tiny JSON
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength) > 2048) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 })
  }

  const auth = await requireAuth()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const bountyId = (body as Record<string, unknown>)?.bounty_id

  // UUID validation — prevents path traversal in storage key
  if (typeof bountyId !== 'string' || !UUID_RE.test(bountyId)) {
    return NextResponse.json({ error: 'Invalid bounty_id' }, { status: 400 })
  }

  // Verify bounty exists and is open
  const { data: bounty } = await auth.admin
    .from('bounties')
    .select('status, submission_formats')
    .eq('id', bountyId)
    .single()

  if (!bounty) {
    return NextResponse.json({ error: 'Bounty not found' }, { status: 404 })
  }
  if (bounty.status !== 'open') {
    return NextResponse.json({ error: 'Bounty is not open' }, { status: 400 })
  }
  if (!bounty.submission_formats.includes('zip')) {
    return NextResponse.json({ error: 'Bounty does not accept zip submissions' }, { status: 400 })
  }

  // Option B cleanup: delete expired upload_pending rows for this user+bounty
  // (proactive; full sweep is handled by the daily cron Edge Function)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  await auth.admin
    .from('submissions')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('bounty_id', bountyId)
    .eq('status', 'upload_pending')
    .lt('created_at', fifteenMinutesAgo)

  // Create upload_pending row — the UUID becomes the upload token
  const tokenExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min TTL
  const { data: pending, error: pendingError } = await auth.admin
    .from('submissions')
    .insert({
      user_id: auth.user.id,
      bounty_id: bountyId,
      status: 'upload_pending',
      submission_type: 'zip',
      upload_token_expires_at: tokenExpiry,
    })
    .select('id')
    .single()

  if (pendingError || !pending) {
    return NextResponse.json({ error: 'Failed to create upload token' }, { status: 500 })
  }

  // Storage path: submissions/{user_id}/{bounty_id}/{submission_id}.zip
  // Three UUID segments prevent path injection — client never controls this string
  const storagePath = `submissions/${auth.user.id}/${bountyId}/${pending.id}.zip`

  // Update the pending row with the storage path
  await auth.admin
    .from('submissions')
    .update({ file_path: storagePath })
    .eq('id', pending.id)

  const { data: signedData, error: signError } = await auth.admin.storage
    .from('submission-zips')
    .createSignedUploadUrl(storagePath)

  if (signError || !signedData) {
    // Clean up the pending row if signed URL fails
    await auth.admin.from('submissions').delete().eq('id', pending.id)
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
  }

  return NextResponse.json({
    signed_url: signedData.signedUrl,
    upload_token: pending.id,
    storage_path: storagePath,
    expires_at: tokenExpiry,
  })
}
