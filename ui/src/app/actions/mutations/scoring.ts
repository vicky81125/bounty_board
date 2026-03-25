'use server'
import { requireOrgMember } from '../_auth'

type CriterionScore = {
  criterion: string
  score: number
  max_points: number
}

export async function scoreSubmission(data: {
  submissionId: string
  orgId: string
  criteriaScores: CriterionScore[]
  notes?: string
}) {
  const auth = await requireOrgMember(data.orgId)
  if (!auth.ok) return { error: auth.error }

  const { data: sub } = await auth.admin
    .from('submissions')
    .select('status, bounty_id, total_score')
    .eq('id', data.submissionId)
    .single()

  if (!sub) return { error: 'Submission not found' }
  if (sub.status !== 'under_review') {
    return { error: 'Submission must be under review to score' }
  }

  // Validate criteria against bounty rubric
  const { data: bounty } = await auth.admin
    .from('bounties')
    .select('rubric')
    .eq('id', sub.bounty_id)
    .single()

  if (!bounty) return { error: 'Bounty not found' }

  const rubric = bounty.rubric as Array<{ criterion: string; max_points: number }>
  const rubricMap = new Map(rubric.map((c) => [c.criterion, c.max_points]))

  for (const cs of data.criteriaScores) {
    const maxPts = rubricMap.get(cs.criterion)
    if (maxPts === undefined) return { error: `Unknown criterion: ${cs.criterion}` }
    if (cs.score < 0 || cs.score > maxPts) {
      return { error: `Score for "${cs.criterion}" must be 0–${maxPts}` }
    }
  }

  // All rubric criteria must be present
  for (const criterion of rubric) {
    if (!data.criteriaScores.find((cs) => cs.criterion === criterion.criterion)) {
      return { error: `Missing score for criterion: ${criterion.criterion}` }
    }
  }

  const totalScore = data.criteriaScores.reduce((s, c) => s + c.score, 0)
  const maxPossibleScore = rubric.reduce((s, c) => s + c.max_points, 0)

  const { error: scoreError } = await auth.admin
    .from('submission_scores')
    .insert({
      submission_id: data.submissionId,
      scored_by: auth.user.id,
      criteria_scores: data.criteriaScores,
      total_score: totalScore,
      max_possible_score: maxPossibleScore,
      notes: data.notes ?? null,
    })

  if (scoreError) return { error: scoreError.message }

  const { error: subError } = await auth.admin
    .from('submissions')
    .update({
      status: 'scored',
      total_score: totalScore,
      max_possible_score: maxPossibleScore,
      scored_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.submissionId)

  if (subError) return { error: subError.message }
  return { data: { totalScore, maxPossibleScore } }
}

export async function overrideScore(data: {
  submissionId: string
  orgId: string
  criteriaScores: CriterionScore[]
  notes?: string
}) {
  // Override requires admin role (not moderator)
  const auth = await requireOrgMember(data.orgId, 'admin')
  if (!auth.ok) return { error: auth.error }

  const { data: sub } = await auth.admin
    .from('submissions')
    .select('status, bounty_id')
    .eq('id', data.submissionId)
    .single()

  if (!sub) return { error: 'Submission not found' }
  if (!['under_review', 'scored'].includes(sub.status)) {
    return { error: 'Can only override under_review or scored submissions' }
  }

  const { data: bounty } = await auth.admin
    .from('bounties')
    .select('rubric')
    .eq('id', sub.bounty_id)
    .single()

  if (!bounty) return { error: 'Bounty not found' }
  const rubric = bounty.rubric as Array<{ criterion: string; max_points: number }>
  const rubricMap = new Map(rubric.map((c) => [c.criterion, c.max_points]))

  for (const cs of data.criteriaScores) {
    const maxPts = rubricMap.get(cs.criterion)
    if (maxPts === undefined) return { error: `Unknown criterion: ${cs.criterion}` }
    if (cs.score < 0 || cs.score > maxPts) {
      return { error: `Score for "${cs.criterion}" must be 0–${maxPts}` }
    }
  }

  const totalScore = data.criteriaScores.reduce((s, c) => s + c.score, 0)
  const maxPossibleScore = rubric.reduce((s, c) => s + c.max_points, 0)

  // Upsert score
  const { error: scoreError } = await auth.admin
    .from('submission_scores')
    .upsert(
      {
        submission_id: data.submissionId,
        scored_by: auth.user.id,
        criteria_scores: data.criteriaScores,
        total_score: totalScore,
        max_possible_score: maxPossibleScore,
        notes: data.notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'submission_id' }
    )

  if (scoreError) return { error: scoreError.message }

  await auth.admin
    .from('submissions')
    .update({
      status: 'scored',
      total_score: totalScore,
      max_possible_score: maxPossibleScore,
      scored_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.submissionId)

  return { data: { totalScore, maxPossibleScore } }
}
