-- =============================================================================
-- Migration 006: RLS Policies + Leaderboard DB Functions
-- Run this in the Supabase SQL Editor AFTER migration 005
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECURITY DEFINER helper — avoids infinite recursion in org_members RLS
-- Defined before the policies that use it
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS on all tables
-- -----------------------------------------------------------------------------

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bounties           ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_scores  ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- profiles policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_read_all"      ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"    ON profiles;
DROP POLICY IF EXISTS "profiles_insert_block"  ON profiles;
DROP POLICY IF EXISTS "profiles_delete_block"  ON profiles;

-- Anyone (including anon) can read profiles (public leaderboard, user pages)
CREATE POLICY "profiles_read_all" ON profiles
  FOR SELECT USING (true);

-- Users can only update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Block direct INSERT — handle_new_user trigger runs as SECURITY DEFINER
CREATE POLICY "profiles_insert_block" ON profiles
  FOR INSERT WITH CHECK (false);

-- Block direct DELETE — deactivation is done via is_active flag
CREATE POLICY "profiles_delete_block" ON profiles
  FOR DELETE USING (false);

-- -----------------------------------------------------------------------------
-- orgs policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "orgs_read_all"       ON orgs;
DROP POLICY IF EXISTS "orgs_write_block"    ON orgs;
DROP POLICY IF EXISTS "orgs_update_block"   ON orgs;
DROP POLICY IF EXISTS "orgs_delete_block"   ON orgs;

CREATE POLICY "orgs_read_all" ON orgs
  FOR SELECT USING (true);

-- All org writes go through Server Actions using the service role (bypasses RLS)
CREATE POLICY "orgs_write_block" ON orgs
  FOR INSERT WITH CHECK (false);

CREATE POLICY "orgs_update_block" ON orgs
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "orgs_delete_block" ON orgs
  FOR DELETE USING (false);

-- -----------------------------------------------------------------------------
-- org_members policies
-- Own memberships OR admins see all members of their org
-- is_org_admin() SECURITY DEFINER avoids recursive RLS evaluation
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "org_members_read"          ON org_members;
DROP POLICY IF EXISTS "org_members_write_block"   ON org_members;
DROP POLICY IF EXISTS "org_members_update_block"  ON org_members;
DROP POLICY IF EXISTS "org_members_delete_block"  ON org_members;

CREATE POLICY "org_members_read" ON org_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_org_admin(org_id)
  );

CREATE POLICY "org_members_write_block" ON org_members
  FOR INSERT WITH CHECK (false);

CREATE POLICY "org_members_update_block" ON org_members
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "org_members_delete_block" ON org_members
  FOR DELETE USING (false);

-- -----------------------------------------------------------------------------
-- bounties policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "bounties_read_all"     ON bounties;
DROP POLICY IF EXISTS "bounties_insert_block" ON bounties;
DROP POLICY IF EXISTS "bounties_update_block" ON bounties;
DROP POLICY IF EXISTS "bounties_delete_block" ON bounties;

-- All bounties readable (public listing — draft bounties filtered in Server Action)
CREATE POLICY "bounties_read_all" ON bounties
  FOR SELECT USING (true);

-- All bounty writes go through Server Actions (service role)
CREATE POLICY "bounties_insert_block" ON bounties
  FOR INSERT WITH CHECK (false);

CREATE POLICY "bounties_update_block" ON bounties
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "bounties_delete_block" ON bounties
  FOR DELETE USING (false);

-- -----------------------------------------------------------------------------
-- submissions policies
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "submissions_read"          ON submissions;
DROP POLICY IF EXISTS "submissions_insert_own"    ON submissions;
DROP POLICY IF EXISTS "submissions_update_own"    ON submissions;
DROP POLICY IF EXISTS "submissions_delete_block"  ON submissions;

-- Own submissions, OR org admin/moderator for their org's bounties
CREATE POLICY "submissions_read" ON submissions
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM bounties b
      JOIN org_members om ON om.org_id = b.org_id
      WHERE b.id = submissions.bounty_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'moderator')
    )
  );

-- Participants insert their own submissions (status starts as upload_pending)
CREATE POLICY "submissions_insert_own" ON submissions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own pending / upload_pending submissions
CREATE POLICY "submissions_update_own" ON submissions
  FOR UPDATE USING (user_id = auth.uid() AND status IN ('pending', 'upload_pending'))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "submissions_delete_block" ON submissions
  FOR DELETE USING (false);

-- -----------------------------------------------------------------------------
-- submission_scores policies
-- All score writes go through Server Actions (service role)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "submission_scores_read"          ON submission_scores;
DROP POLICY IF EXISTS "submission_scores_insert_block"  ON submission_scores;
DROP POLICY IF EXISTS "submission_scores_update_block"  ON submission_scores;
DROP POLICY IF EXISTS "submission_scores_delete_block"  ON submission_scores;

-- Submitter sees their own scores; org admin/moderator sees all scores for their bounties
CREATE POLICY "submission_scores_read" ON submission_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM submissions sub
      WHERE sub.id = submission_scores.submission_id
        AND sub.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM submissions sub
      JOIN bounties b  ON b.id = sub.bounty_id
      JOIN org_members om ON om.org_id = b.org_id
      WHERE sub.id = submission_scores.submission_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'moderator')
    )
  );

-- Block all direct client writes — Server Actions use service role
CREATE POLICY "submission_scores_insert_block" ON submission_scores
  FOR INSERT WITH CHECK (false);

CREATE POLICY "submission_scores_update_block" ON submission_scores
  FOR UPDATE WITH CHECK (false);

CREATE POLICY "submission_scores_delete_block" ON submission_scores
  FOR DELETE USING (false);

-- -----------------------------------------------------------------------------
-- Leaderboard DB functions
-- caller_id is always auth.uid() — never accepted from client parameters
-- get_bounty_leaderboard: includes total_count for pagination
-- get_global_leaderboard: filters global_score > 0, hard→medium→easy tiebreak
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_bounty_leaderboard(
  p_bounty_id UUID,
  p_limit     INT DEFAULT 50,
  p_offset    INT DEFAULT 0
)
RETURNS TABLE (
  user_id           UUID,
  username          TEXT,
  display_name      TEXT,
  avatar_url        TEXT,
  total_score       INT,
  max_possible_score INT,
  score_percentage  NUMERIC,
  submitted_at      TIMESTAMPTZ,
  rank              BIGINT,
  total_count       BIGINT,
  is_caller         BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Caller must have a submission OR be an org admin/moderator
  IF NOT EXISTS (
    SELECT 1 FROM submissions
    WHERE bounty_id = p_bounty_id
      AND user_id = v_caller_id
      AND status NOT IN ('upload_pending', 'rejected')
  ) AND NOT EXISTS (
    SELECT 1 FROM bounties b
    JOIN org_members om ON om.org_id = b.org_id
    WHERE b.id = p_bounty_id
      AND om.user_id = v_caller_id
      AND om.role IN ('admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id                                                                        AS user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    ss.total_score,
    ss.max_possible_score,
    ROUND(ss.total_score::NUMERIC / NULLIF(ss.max_possible_score::NUMERIC, 0) * 100, 1) AS score_percentage,
    sub.submitted_at,
    RANK() OVER (ORDER BY ss.total_score DESC, sub.submitted_at ASC)            AS rank,
    COUNT(*) OVER ()                                                             AS total_count,
    (p.id = v_caller_id)                                                        AS is_caller
  FROM submission_scores ss
  JOIN submissions sub ON sub.id = ss.submission_id
  JOIN profiles p      ON p.id = sub.user_id
  WHERE sub.bounty_id = p_bounty_id
    AND sub.status = 'scored'
  ORDER BY ss.total_score DESC, sub.submitted_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;


CREATE OR REPLACE FUNCTION get_global_leaderboard(
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  user_id          UUID,
  username         TEXT,
  display_name     TEXT,
  avatar_url       TEXT,
  global_score     NUMERIC,
  bounties_solved  BIGINT,
  top_difficulties TEXT[],
  rank             BIGINT,
  total_count      BIGINT,
  is_caller        BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    p.id                           AS user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.global_score,
    (
      SELECT COUNT(DISTINCT sub.bounty_id)
      FROM submissions sub
      WHERE sub.user_id = p.id AND sub.status = 'scored'
    )                              AS bounties_solved,
    (
      SELECT ARRAY_AGG(DISTINCT b.difficulty ORDER BY b.difficulty)
      FROM submissions sub
      JOIN bounties b ON b.id = sub.bounty_id
      WHERE sub.user_id = p.id AND sub.status = 'scored'
    )                              AS top_difficulties,
    RANK() OVER (ORDER BY p.global_score DESC) AS rank,
    COUNT(*) OVER ()               AS total_count,
    (p.id = v_caller_id)           AS is_caller
  FROM profiles p
  WHERE p.global_score > 0
    AND p.is_active = TRUE
  ORDER BY
    (
      SELECT COALESCE(SUM(ss.total_score::NUMERIC / NULLIF(ss.max_possible_score::NUMERIC, 0) * 2.0), 0)
      FROM submission_scores ss
      JOIN submissions sub ON sub.id = ss.submission_id
      JOIN bounties b      ON b.id = sub.bounty_id
      WHERE sub.user_id = p.id AND b.difficulty = 'hard' AND sub.status = 'scored'
    ) DESC,
    (
      SELECT COALESCE(SUM(ss.total_score::NUMERIC / NULLIF(ss.max_possible_score::NUMERIC, 0) * 1.5), 0)
      FROM submission_scores ss
      JOIN submissions sub ON sub.id = ss.submission_id
      JOIN bounties b      ON b.id = sub.bounty_id
      WHERE sub.user_id = p.id AND b.difficulty = 'medium' AND sub.status = 'scored'
    ) DESC,
    p.global_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
