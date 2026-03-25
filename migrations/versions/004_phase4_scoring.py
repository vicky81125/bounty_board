"""Phase 4: scoring and leaderboards

Revision ID: 004
Revises: 003
Create Date: 2026-03-25
"""
from __future__ import annotations

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Scoring columns on submissions (denormalized for fast leaderboard queries)
    op.execute("""
        ALTER TABLE submissions
            ADD COLUMN IF NOT EXISTS total_score INT,
            ADD COLUMN IF NOT EXISTS max_possible_score INT,
            ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ
    """)

    # submission_scores: one row per submission (1:1 with scored submissions)
    op.execute("""
        CREATE TABLE IF NOT EXISTS submission_scores (
            id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            submission_id      UUID NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
            scored_by          UUID NOT NULL REFERENCES users(id),
            criteria_scores    JSONB NOT NULL,
            total_score        INT NOT NULL,
            max_possible_score INT NOT NULL,
            notes              TEXT,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    # Materialized global score on users table
    op.execute("""
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS global_score NUMERIC NOT NULL DEFAULT 0
    """)

    # Indexes for leaderboard ordering
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_global_score ON users(global_score DESC)")
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_submissions_bounty_score
            ON submissions(bounty_id, total_score DESC NULLS LAST)
            WHERE status = 'scored'
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_submissions_bounty_score")
    op.execute("DROP INDEX IF EXISTS idx_users_global_score")
    op.execute("DROP TABLE IF EXISTS submission_scores CASCADE")
    op.execute("ALTER TABLE submissions DROP COLUMN IF EXISTS total_score")
    op.execute("ALTER TABLE submissions DROP COLUMN IF EXISTS max_possible_score")
    op.execute("ALTER TABLE submissions DROP COLUMN IF EXISTS scored_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS global_score")
