"""Phase 2: bounties table

Revision ID: 002
Revises: 001
Create Date: 2026-03-25
"""
from __future__ import annotations

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS bounties (
            id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id                   UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            created_by               UUID NOT NULL REFERENCES users(id),
            title                    TEXT NOT NULL,
            description_md           TEXT NOT NULL DEFAULT '',
            ideal_output_md          TEXT NOT NULL DEFAULT '',
            start_date               TIMESTAMPTZ,
            end_date                 TIMESTAMPTZ,
            difficulty               TEXT NOT NULL DEFAULT 'medium',
            tags                     TEXT[] NOT NULL DEFAULT '{}',
            skills_required          JSONB NOT NULL DEFAULT '[]',
            submission_formats       TEXT[] NOT NULL,
            rubric                   JSONB NOT NULL DEFAULT '[]',
            status                   TEXT NOT NULL DEFAULT 'draft',
            prize                    JSONB,
            resources                JSONB NOT NULL DEFAULT '[]',
            eligibility_notes        TEXT,
            max_submissions_per_user INTEGER,
            search_vector            TSVECTOR,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        ALTER TABLE bounties
            ADD CONSTRAINT chk_bounty_status
            CHECK (status IN ('draft', 'open', 'closed'))
    """)

    op.execute("""
        ALTER TABLE bounties
            ADD CONSTRAINT chk_bounty_difficulty
            CHECK (difficulty IN ('easy', 'medium', 'hard'))
    """)

    op.execute("""
        ALTER TABLE bounties
            ADD CONSTRAINT chk_submission_formats_nonempty
            CHECK (array_length(submission_formats, 1) >= 1)
    """)

    op.execute("""
        ALTER TABLE bounties
            ADD CONSTRAINT chk_submission_formats_values
            CHECK (submission_formats <@ ARRAY['zip','github_url','drive_url']::TEXT[])
    """)

    # Full-text search trigger
    op.execute("""
        CREATE OR REPLACE FUNCTION bounties_search_vector_trigger() RETURNS trigger AS $$
        BEGIN
            NEW.search_vector :=
                to_tsvector('english', coalesce(NEW.title, '')) ||
                to_tsvector('english', coalesce(NEW.description_md, ''));
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)

    op.execute("""
        CREATE TRIGGER trig_bounties_search_vector
        BEFORE INSERT OR UPDATE ON bounties
        FOR EACH ROW EXECUTE FUNCTION bounties_search_vector_trigger()
    """)

    # Indexes
    op.execute("CREATE INDEX idx_bounties_org_id     ON bounties(org_id)")
    op.execute("CREATE INDEX idx_bounties_status     ON bounties(status)")
    op.execute("CREATE INDEX idx_bounties_difficulty ON bounties(difficulty)")
    op.execute("CREATE INDEX idx_bounties_end_date   ON bounties(end_date)")
    op.execute("CREATE INDEX idx_bounties_tags       ON bounties USING gin(tags)")
    op.execute("CREATE INDEX idx_bounties_search     ON bounties USING gin(search_vector)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS bounties")
    op.execute("DROP FUNCTION IF EXISTS bounties_search_vector_trigger")
