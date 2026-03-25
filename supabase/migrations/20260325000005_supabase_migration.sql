-- =============================================================================
-- Migration 005: Supabase Architecture Migration
-- Rename users → profiles, drop sessions, add triggers
-- Run this in the Supabase SQL Editor (NOT via supabase db push directly)
-- =============================================================================

-- Drop custom sessions table — Supabase Auth handles sessions
DROP TABLE IF EXISTS sessions CASCADE;

-- -----------------------------------------------------------------------------
-- Rename users → profiles
-- All FK columns referencing users(id) keep working unchanged (same UUIDs)
-- -----------------------------------------------------------------------------

ALTER TABLE users RENAME TO profiles;
ALTER INDEX IF EXISTS idx_users_global_score RENAME TO idx_profiles_global_score;

-- Drop columns managed by Supabase Auth (password, email verification, last seen)
ALTER TABLE profiles
  DROP COLUMN IF EXISTS password_hash,
  DROP COLUMN IF EXISTS email_verified,
  DROP COLUMN IF EXISTS last_seen_at;

-- Rename the existing account_type CHECK constraint (must drop + recreate)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_account_type;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_account_type_check
  CHECK (account_type IN ('organizer', 'participant'));

-- Rename the existing username format CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS chk_username_format;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_username_format_check
  CHECK (username ~ '^[a-z0-9_-]{3,30}$');

-- Add global_score if not already present (migration 004 adds it to users)
-- Safe to run even if the column already exists
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS global_score NUMERIC NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- Update foreign key references on other tables to use the renamed table name
-- In PostgreSQL, renaming a table also renames the FK target — no action needed.
-- But the FK columns themselves (user_id, created_by, scored_by) still work.
-- -----------------------------------------------------------------------------

-- Explicitly update FK constraints on orgs to reference profiles
ALTER TABLE orgs DROP CONSTRAINT IF EXISTS orgs_created_by_fkey;
ALTER TABLE orgs
  ADD CONSTRAINT orgs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE org_members DROP CONSTRAINT IF EXISTS org_members_user_id_fkey;
ALTER TABLE org_members
  ADD CONSTRAINT org_members_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE bounties DROP CONSTRAINT IF EXISTS bounties_created_by_fkey;
ALTER TABLE bounties
  ADD CONSTRAINT bounties_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_user_id_fkey;
ALTER TABLE submissions
  ADD CONSTRAINT submissions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE submission_scores DROP CONSTRAINT IF EXISTS submission_scores_scored_by_fkey;
ALTER TABLE submission_scores
  ADD CONSTRAINT submission_scores_scored_by_fkey
  FOREIGN KEY (scored_by) REFERENCES profiles(id);

-- -----------------------------------------------------------------------------
-- Profile creation trigger
-- Fires on INSERT to auth.users, creates the profiles row automatically
-- ON CONFLICT (id) DO NOTHING = idempotent for re-signup edge cases
-- avatar_url populated for future OAuth (Google SSO)
-- account_type sanitised: only 'organizer'/'participant' allowed
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    username,
    display_name,
    account_type,
    bio,
    location,
    skills,
    website_url,
    github_url,
    linkedin_url,
    twitter_url,
    avatar_url,
    is_active,
    global_score
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'account_type' IN ('organizer', 'participant')
        THEN NEW.raw_user_meta_data->>'account_type'
      ELSE 'participant'
    END,
    NULL,
    NULL,
    '{}',
    NULL,
    NULL,
    NULL,
    NULL,
    NEW.raw_user_meta_data->>'avatar_url',
    TRUE,
    0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- -----------------------------------------------------------------------------
-- Global score recompute trigger
-- Fires on INSERT or UPDATE to submission_scores
-- Only counts submissions with status = 'scored'
-- Handles both single and tiered prize structures
-- No dead variables (v_difficulty, v_mult, v_prize_amount removed)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recompute_global_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id   UUID;
  v_new_score NUMERIC;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT COALESCE(SUM(
    ss.total_score::NUMERIC / NULLIF(ss.max_possible_score::NUMERIC, 0)
    * CASE b.difficulty
        WHEN 'easy'   THEN 1.0
        WHEN 'medium' THEN 1.5
        WHEN 'hard'   THEN 2.0
        ELSE               1.0
      END
    * CASE
        WHEN b.prize->>'type' = 'single'
          THEN (b.prize->>'amount')::NUMERIC
        WHEN b.prize->>'type' = 'tiered'
          THEN (
            SELECT COALESCE(SUM((t->>'amount')::NUMERIC), 0)
            FROM jsonb_array_elements(b.prize->'tiers') AS t
          )
        ELSE 100.0
      END
  ), 0)
  INTO v_new_score
  FROM submission_scores ss
  JOIN submissions sub ON sub.id = ss.submission_id
  JOIN bounties b      ON b.id = sub.bounty_id
  WHERE sub.user_id = v_user_id
    AND sub.status = 'scored';

  UPDATE profiles
  SET global_score = v_new_score
  WHERE id = v_user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_submission_scored ON submission_scores;
CREATE TRIGGER on_submission_scored
  AFTER INSERT OR UPDATE ON submission_scores
  FOR EACH ROW EXECUTE FUNCTION recompute_global_score();
