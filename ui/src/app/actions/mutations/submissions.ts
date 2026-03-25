'use server'
import { requireAuth, requireOrgMember } from '../_auth'

const GITHUB_URL_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9]([A-Za-z0-9_-]{0,38}[A-Za-z0-9])?\/[A-Za-z0-9][A-Za-z0-9._-]{0,98}[A-Za-z0-9]$/

const DRIVE_URL_RE =
  /^https:\/\/drive\.google\.com\/(file\/d\/[A-Za-z0-9_-]+(\/[^?#]*)?|drive\/folders\/[A-Za-z0-9_-]+(\/[^?#]*)?|open\?id=[A-Za-z0-9_-]+)$/

const STORAGE_PATH_RE =
  /^submissions\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.zip$/i

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['under_review', 'rejected'],
  under_review: ['rejected', 'scored'],
}

export async function createSubmission(data: {
  bountyId: string
  uploadToken?: string
  externalUrl?: string
  submissionType: 'zip' | 'github_url' | 'drive_url'
  description?: string
}) {
  const auth = await requireAuth()
  if (!auth.ok) return { error: auth.error }

  const { bountyId, uploadToken, externalUrl, submissionType, description } = data

  // Validate URL submissions
  if (submissionType === 'github_url') {
    if (!externalUrl || !GITHUB_URL_RE.test(externalUrl)) {
      return { error: 'Invalid GitHub repository URL' }
    }
  } else if (submissionType === 'drive_url') {
    if (!externalUrl || !DRIVE_URL_RE.test(externalUrl)) {
      return { error: 'Invalid Google Drive URL' }
    }
  }

  // Fetch bounty details
  const { data: bounty } = await auth.admin
    .from('bounties')
    .select('status, submission_formats, max_submissions_per_user')
    .eq('id', bountyId)
    .single()

  if (!bounty) return { error: 'Bounty not found' }
  if (bounty.status !== 'open') return { error: 'This bounty is not open for submissions' }
  if (!bounty.submission_formats.includes(submissionType)) {
    return { error: `Submission type ${submissionType} is not accepted for this bounty` }
  }

  // max_submissions_per_user enforcement (non-rejected submissions)
  if (bounty.max_submissions_per_user) {
    const { count } = await auth.admin
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('bounty_id', bountyId)
      .eq('user_id', auth.user.id)
      .not('status', 'in', '(rejected,upload_pending)')

    if ((count ?? 0) >= bounty.max_submissions_per_user) {
      return { error: `Maximum ${bounty.max_submissions_per_user} submissions allowed per user` }
    }
  }

  if (submissionType === 'zip') {
    // Validate upload token
    if (!uploadToken) return { error: 'Upload token is required for zip submissions' }

    const { data: pending } = await auth.admin
      .from('submissions')
      .select('id, file_path, upload_token_expires_at')
      .eq('id', uploadToken)
      .eq('user_id', auth.user.id)
      .eq('bounty_id', bountyId)
      .eq('status', 'upload_pending')
      .single()

    if (!pending) return { error: 'Invalid or expired upload token' }
    if (
      pending.upload_token_expires_at &&
      new Date(pending.upload_token_expires_at) < new Date()
    ) {
      return { error: 'Upload token has expired' }
    }
    if (!pending.file_path || !STORAGE_PATH_RE.test(pending.file_path)) {
      return { error: 'Invalid storage path' }
    }

    // Promote upload_pending to pending
    const { error } = await auth.admin
      .from('submissions')
      .update({
        status: 'pending',
        submission_type: 'zip',
        description: description ?? '',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', uploadToken)

    if (error) {
      if (error.code === '23505') {
        return { error: 'You already have an active submission for this bounty' }
      }
      return { error: error.message }
    }

    return { data: { id: uploadToken } }
  }

  // URL-based submission
  const { data: submission, error } = await auth.admin
    .from('submissions')
    .insert({
      bounty_id: bountyId,
      user_id: auth.user.id,
      status: 'pending',
      submission_type: submissionType,
      external_url: externalUrl,
      description: description ?? '',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'You already have an active submission for this bounty' }
    }
    return { error: error.message }
  }

  return { data: submission }
}

export async function updateSubmission(
  submissionId: string,
  updates: {
    description?: string
    submissionType?: 'zip' | 'github_url' | 'drive_url'
    externalUrl?: string
    uploadToken?: string
  }
) {
  const auth = await requireAuth()
  if (!auth.ok) return { error: auth.error }

  const { data: sub } = await auth.admin
    .from('submissions')
    .select('id, status, submission_type, file_path, bounty_id')
    .eq('id', submissionId)
    .eq('user_id', auth.user.id)
    .single()

  if (!sub) return { error: 'Submission not found' }
  if (sub.status !== 'pending') return { error: 'Only pending submissions can be edited' }

  if (updates.submissionType === 'github_url') {
    if (!updates.externalUrl || !GITHUB_URL_RE.test(updates.externalUrl)) {
      return { error: 'Invalid GitHub repository URL' }
    }
  } else if (updates.submissionType === 'drive_url') {
    if (!updates.externalUrl || !DRIVE_URL_RE.test(updates.externalUrl)) {
      return { error: 'Invalid Google Drive URL' }
    }
  }

  // Switching FROM zip: delete old storage file
  if (sub.submission_type === 'zip' && updates.submissionType && updates.submissionType !== 'zip') {
    if (sub.file_path) {
      await auth.admin.storage.from('submission-zips').remove([sub.file_path])
    }
  }

  const { error } = await auth.admin
    .from('submissions')
    .update({
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.submissionType && { submission_type: updates.submissionType }),
      ...(updates.externalUrl !== undefined && { external_url: updates.externalUrl }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) return { error: error.message }
  return { data: { success: true } }
}

export async function updateSubmissionStatus(
  submissionId: string,
  orgId: string,
  newStatus: 'under_review' | 'rejected' | 'scored',
  reviewNotes?: string
) {
  const auth = await requireOrgMember(orgId)
  if (!auth.ok) return { error: auth.error }

  const { data: sub } = await auth.admin
    .from('submissions')
    .select('status')
    .eq('id', submissionId)
    .single()

  if (!sub) return { error: 'Submission not found' }

  const allowed = VALID_TRANSITIONS[sub.status] ?? []
  if (!allowed.includes(newStatus)) {
    return { error: `Cannot transition from ${sub.status} to ${newStatus}` }
  }

  const { error } = await auth.admin
    .from('submissions')
    .update({
      status: newStatus,
      ...(reviewNotes !== undefined && { review_notes: reviewNotes }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) return { error: error.message }
  return { data: { success: true } }
}

export async function getDownloadUrl(submissionId: string) {
  const auth = await requireAuth()
  if (!auth.ok) return { error: auth.error }

  const { data: sub } = await auth.admin
    .from('submissions')
    .select('file_path, user_id, bounty_id')
    .eq('id', submissionId)
    .single()

  if (!sub || !sub.file_path) return { error: 'Submission not found or not a zip submission' }

  // Check caller is submitter or org admin/moderator
  const isOwner = sub.user_id === auth.user.id
  if (!isOwner) {
    const { data: membership } = await auth.admin
      .from('bounties')
      .select('org_members!inner(role)')
      .eq('id', sub.bounty_id)
      .eq('org_members.user_id', auth.user.id)
      .single()

    if (!membership) return { error: 'Forbidden' }
  }

  const { data: signed, error } = await auth.admin.storage
    .from('submission-zips')
    .createSignedUrl(sub.file_path, 3600) // 1-hour expiry

  if (error || !signed) return { error: 'Failed to generate download URL' }
  return { data: { url: signed.signedUrl } }
}
