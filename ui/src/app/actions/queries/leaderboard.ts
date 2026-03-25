import 'server-only'
import { createClient } from '@/lib/supabase/server'

export async function getBountyLeaderboard(
  bountyId: string,
  limit = 50,
  offset = 0
) {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_bounty_leaderboard', {
    p_bounty_id: bountyId,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) return { error: error.message }
  return {
    data: {
      items: data ?? [],
      total: data?.[0]?.total_count ?? 0,
    },
  }
}

export async function getGlobalLeaderboard(limit = 50, offset = 0) {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_global_leaderboard', {
    p_limit: limit,
    p_offset: offset,
  })

  if (error) return { error: error.message }
  return {
    data: {
      items: data ?? [],
      total: data?.[0]?.total_count ?? 0,
    },
  }
}
