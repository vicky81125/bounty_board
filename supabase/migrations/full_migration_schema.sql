-- =============================================================================
-- FULL SCHEMA — run this on a brand-new Supabase project
-- Replaces migrations 001–006 (create fresh, not incremental)
-- Run once in Supabase SQL Editor, then you're done.
-- =============================================================================

-- =============================================================================
-- TABLES
-- =============================================================================

-- profiles — one row per auth.users record (created by trigger below)
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT        NOT NULL,
  username        TEXT        NOT NULL UNIQUE,
  display_name    TEXT        NOT NULL,
  account_type    TEXT        NOT NULL DEFAULT 'participant'
                              CONSTRAINT profiles_account_type_check
                              CHECK (account_type IN ('organizer', 'participant')),
  bio             TEXT,
  location        TEXT,
  skills          TEXT[]      NOT NULL DEFAULT '{}',
  website_url     TEXT,
  github_url      TEXT,
  linkedin_url    TEXT,
  twitter_url     TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  global_score    NUMERIC     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format_check
    CHECK (username ~ '^[a-z0-9_-]{3,30}$')
);

CREATE INDEX IF NOT EXISTS idx_profiles_global_score ON profiles(global_score DESC);

-- orgs — organisations that post bounties
CREATE TABLE IF NOT EXISTS orgs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  description TEXT,
  website_url TEXT,
  avatar_url  TEXT,
  created_by  UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- org_members — users belonging to an org
CREATE TABLE IF NOT EXISTS org_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'admin'
                         CHECK (role IN ('admin', 'moderator', 'viewer')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- bounties — challenges posted by orgs
CREATE TABLE IF NOT EXISTS bounties (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by                UUID        REFERENCES profiles(id),
  title                     TEXT        NOT NULL,
  description_md            TEXT        NOT NULL DEFAULT '',
  ideal_output_md           TEXT        NOT NULL DEFAULT '',
  start_date                TIMESTAMPTZ,
  end_date                  TIMESTAMPTZ,
  difficulty                TEXT        NOT NULL DEFAULT 'medium'
                                        CHECK (difficulty IN ('easy', 'medium', 'hard')),
  tags                      TEXT[]      NOT NULL DEFAULT '{}',
  skills_required           JSONB       NOT NULL DEFAULT '[]',
  submission_formats        TEXT[]      NOT NULL DEFAULT '{}',
  rubric                    JSONB       NOT NULL DEFAULT '[]',
  prize                     JSONB,
  resources                 JSONB       NOT NULL DEFAULT '[]',
  eligibility_notes         TEXT,
  max_submissions_per_user  INTEGER,
  status                    TEXT        NOT NULL DEFAULT 'draft'
                                        CHECK (status IN ('draft', 'open', 'closed')),
  search_vector             TSVECTOR,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounties_org_id       ON bounties(org_id);
CREATE INDEX IF NOT EXISTS idx_bounties_status        ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_search_vector ON bounties USING GIN(search_vector);

-- submissions — solver entries for bounties
CREATE TABLE IF NOT EXISTS submissions (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id                UUID        NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
  user_id                  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status                   TEXT        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('upload_pending','pending','under_review','rejected','scored')),
  submission_type          TEXT        NOT NULL
                                       CHECK (submission_type IN ('zip','github_url','drive_url')),
  description              TEXT        NOT NULL DEFAULT '',
  external_url             TEXT,
  file_path                TEXT,
  upload_token_expires_at  TIMESTAMPTZ,
  total_score              NUMERIC,
  max_possible_score       NUMERIC,
  review_notes             TEXT,
  submitted_at             TIMESTAMPTZ,
  scored_at                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active (non-rejected, non-upload_pending) submission per user per bounty
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_one_active
  ON submissions(bounty_id, user_id)
  WHERE status NOT IN ('rejected', 'upload_pending');

CREATE INDEX IF NOT EXISTS idx_submissions_bounty_id ON submissions(bounty_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id   ON submissions(user_id);

-- submission_scores — rubric scores assigned by org reviewers
CREATE TABLE IF NOT EXISTS submission_scores (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id       UUID        NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  scored_by           UUID        REFERENCES profiles(id),
  criteria_scores     JSONB       NOT NULL DEFAULT '[]',
  total_score         NUMERIC     NOT NULL,
  max_possible_score  NUMERIC     NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- 1. Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, username, display_name, account_type,
    bio, location, skills,
    website_url, github_url, linkedin_url, twitter_url, avatar_url,
    is_active, global_score
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
    NULL, NULL, '{}', NULL, NULL, NULL, NULL,
    NEW.raw_user_meta_data->>'avatar_url',
    TRUE, 0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 2. Recompute global_score when a submission is scored
CREATE OR REPLACE FUNCTION recompute_global_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id   UUID;
  v_new_score NUMERIC;
BEGIN
  -- submission_scores has no user_id — look it up from submissions
  SELECT user_id INTO v_user_id
  FROM submissions
  WHERE id = COALESCE(NEW.submission_id, OLD.submission_id);

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

  UPDATE profiles SET global_score = v_new_score WHERE id = v_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_submission_scored ON submission_scores;
CREATE TRIGGER on_submission_scored
  AFTER INSERT OR UPDATE ON submission_scores
  FOR EACH ROW EXECUTE FUNCTION recompute_global_score();

-- 3. Keep bounty search_vector up to date
CREATE OR REPLACE FUNCTION update_bounty_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description_md, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_bounty_upsert ON bounties;
CREATE TRIGGER on_bounty_upsert
  BEFORE INSERT OR UPDATE ON bounties
  FOR EACH ROW EXECUTE FUNCTION update_bounty_search_vector();

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bounties           ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_scores  ENABLE ROW LEVEL SECURITY;

-- Helper — avoids infinite recursion when org_members policies call each other
CREATE OR REPLACE FUNCTION is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- profiles
DROP POLICY IF EXISTS "profiles_read_all"     ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON profiles;
DROP POLICY IF EXISTS "profiles_insert_block" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_block" ON profiles;

CREATE POLICY "profiles_read_all"     ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own"   ON profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_block" ON profiles FOR INSERT WITH CHECK (false);
CREATE POLICY "profiles_delete_block" ON profiles FOR DELETE USING (false);

-- orgs
DROP POLICY IF EXISTS "orgs_read_all"      ON orgs;
DROP POLICY IF EXISTS "orgs_write_block"   ON orgs;
DROP POLICY IF EXISTS "orgs_update_block"  ON orgs;
DROP POLICY IF EXISTS "orgs_delete_block"  ON orgs;

CREATE POLICY "orgs_read_all"      ON orgs FOR SELECT USING (true);
CREATE POLICY "orgs_write_block"   ON orgs FOR INSERT WITH CHECK (false);
CREATE POLICY "orgs_update_block"  ON orgs FOR UPDATE WITH CHECK (false);
CREATE POLICY "orgs_delete_block"  ON orgs FOR DELETE USING (false);

-- org_members
DROP POLICY IF EXISTS "org_members_read"         ON org_members;
DROP POLICY IF EXISTS "org_members_write_block"  ON org_members;
DROP POLICY IF EXISTS "org_members_update_block" ON org_members;
DROP POLICY IF EXISTS "org_members_delete_block" ON org_members;

CREATE POLICY "org_members_read" ON org_members FOR SELECT
  USING (user_id = auth.uid() OR is_org_admin(org_id));
CREATE POLICY "org_members_write_block"  ON org_members FOR INSERT WITH CHECK (false);
CREATE POLICY "org_members_update_block" ON org_members FOR UPDATE WITH CHECK (false);
CREATE POLICY "org_members_delete_block" ON org_members FOR DELETE USING (false);

-- bounties
DROP POLICY IF EXISTS "bounties_read_all"     ON bounties;
DROP POLICY IF EXISTS "bounties_insert_block" ON bounties;
DROP POLICY IF EXISTS "bounties_update_block" ON bounties;
DROP POLICY IF EXISTS "bounties_delete_block" ON bounties;

CREATE POLICY "bounties_read_all"     ON bounties FOR SELECT USING (true);
CREATE POLICY "bounties_insert_block" ON bounties FOR INSERT WITH CHECK (false);
CREATE POLICY "bounties_update_block" ON bounties FOR UPDATE WITH CHECK (false);
CREATE POLICY "bounties_delete_block" ON bounties FOR DELETE USING (false);

-- submissions
DROP POLICY IF EXISTS "submissions_read"         ON submissions;
DROP POLICY IF EXISTS "submissions_insert_own"   ON submissions;
DROP POLICY IF EXISTS "submissions_update_own"   ON submissions;
DROP POLICY IF EXISTS "submissions_delete_block" ON submissions;

CREATE POLICY "submissions_read" ON submissions FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM bounties b
      JOIN org_members om ON om.org_id = b.org_id
      WHERE b.id = submissions.bounty_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'moderator')
    )
  );
CREATE POLICY "submissions_insert_own"   ON submissions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "submissions_update_own"   ON submissions FOR UPDATE
  USING (user_id = auth.uid() AND status IN ('pending', 'upload_pending'))
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "submissions_delete_block" ON submissions FOR DELETE USING (false);

-- submission_scores
DROP POLICY IF EXISTS "submission_scores_read"         ON submission_scores;
DROP POLICY IF EXISTS "submission_scores_insert_block" ON submission_scores;
DROP POLICY IF EXISTS "submission_scores_update_block" ON submission_scores;
DROP POLICY IF EXISTS "submission_scores_delete_block" ON submission_scores;

CREATE POLICY "submission_scores_read" ON submission_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM submissions sub
      WHERE sub.id = submission_scores.submission_id AND sub.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM submissions sub
      JOIN bounties b   ON b.id = sub.bounty_id
      JOIN org_members om ON om.org_id = b.org_id
      WHERE sub.id = submission_scores.submission_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'moderator')
    )
  );
CREATE POLICY "submission_scores_insert_block" ON submission_scores FOR INSERT WITH CHECK (false);
CREATE POLICY "submission_scores_update_block" ON submission_scores FOR UPDATE WITH CHECK (false);
CREATE POLICY "submission_scores_delete_block" ON submission_scores FOR DELETE USING (false);

-- =============================================================================
-- LEADERBOARD FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION get_bounty_leaderboard(
  p_bounty_id UUID,
  p_limit     INT DEFAULT 50,
  p_offset    INT DEFAULT 0
)
RETURNS TABLE (
  user_id            UUID,
  username           TEXT,
  display_name       TEXT,
  avatar_url         TEXT,
  total_score        INT,
  max_possible_score INT,
  score_percentage   NUMERIC,
  submitted_at       TIMESTAMPTZ,
  rank               BIGINT,
  total_count        BIGINT,
  is_caller          BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM submissions
    WHERE bounty_id = p_bounty_id AND user_id = v_caller_id
      AND status NOT IN ('upload_pending', 'rejected')
  ) AND NOT EXISTS (
    SELECT 1 FROM bounties b
    JOIN org_members om ON om.org_id = b.org_id
    WHERE b.id = p_bounty_id AND om.user_id = v_caller_id AND om.role IN ('admin', 'moderator')
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    ss.total_score,
    ss.max_possible_score,
    ROUND(ss.total_score::NUMERIC / NULLIF(ss.max_possible_score::NUMERIC, 0) * 100, 1),
    sub.submitted_at,
    RANK() OVER (ORDER BY ss.total_score DESC, sub.submitted_at ASC),
    COUNT(*) OVER (),
    (p.id = v_caller_id)
  FROM submission_scores ss
  JOIN submissions sub ON sub.id = ss.submission_id
  JOIN profiles p      ON p.id = sub.user_id
  WHERE sub.bounty_id = p_bounty_id AND sub.status = 'scored'
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
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.global_score,
    (SELECT COUNT(DISTINCT sub.bounty_id) FROM submissions sub
     WHERE sub.user_id = p.id AND sub.status = 'scored'),
    (SELECT ARRAY_AGG(DISTINCT b.difficulty ORDER BY b.difficulty)
     FROM submissions sub JOIN bounties b ON b.id = sub.bounty_id
     WHERE sub.user_id = p.id AND sub.status = 'scored'),
    RANK() OVER (ORDER BY p.global_score DESC),
    COUNT(*) OVER (),
    (p.id = v_caller_id)
  FROM profiles p
  WHERE p.global_score > 0 AND p.is_active = TRUE
  ORDER BY
    (SELECT COALESCE(SUM(ss.total_score::NUMERIC / NULLIF(ss.max_possible_score::NUMERIC,0) * 2.0), 0)
     FROM submission_scores ss JOIN submissions sub ON sub.id = ss.submission_id
     JOIN bounties b ON b.id = sub.bounty_id
     WHERE sub.user_id = p.id AND b.difficulty = 'hard' AND sub.status = 'scored') DESC,
    (SELECT COALESCE(SUM(ss.total_score::NUMERIC / NULLIF(ss.max_possible_score::NUMERIC,0) * 1.5), 0)
     FROM submission_scores ss JOIN submissions sub ON sub.id = ss.submission_id
     JOIN bounties b ON b.id = sub.bounty_id
     WHERE sub.user_id = p.id AND b.difficulty = 'medium' AND sub.status = 'scored') DESC,
    p.global_score DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- =============================================================================
-- STORAGE
-- Run this ONLY if you haven't created the bucket yet.
-- In Supabase dashboard: Storage → New bucket → name: "submissions", Public: OFF
-- Then run this policy block:
-- =============================================================================

-- Storage RLS: authenticated users can upload to their own path
-- submissions/{user_id}/{bounty_id}/{submission_id}.zip
INSERT INTO storage.buckets (id, name, public)
VALUES ('submissions', 'submissions', FALSE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "submissions_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "submissions_read_own"   ON storage.objects;

CREATE POLICY "submissions_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[1] = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
  );

CREATE POLICY "submissions_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'submissions'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
  );
