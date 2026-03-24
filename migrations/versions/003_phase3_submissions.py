"""Phase 3: submissions table

Revision ID: 003
Revises: 002
Create Date: 2026-03-25
"""
from __future__ import annotations

from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS submissions (
            id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            bounty_id                UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
            user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status                   TEXT NOT NULL DEFAULT 'pending',
            submission_type          TEXT NOT NULL,
            file_path                TEXT,
            external_url             TEXT,
            description              TEXT NOT NULL DEFAULT '',
            attempt_number           INTEGER NOT NULL DEFAULT 1,
            review_notes             TEXT,
            submitted_at             TIMESTAMPTZ,
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            reviewed_at              TIMESTAMPTZ,
            upload_token_expires_at  TIMESTAMPTZ
        )
    """)

    op.execute("""
        ALTER TABLE submissions
          ADD CONSTRAINT chk_submission_type
          CHECK (submission_type IN ('zip', 'github_url', 'drive_url'))
    """)

    op.execute("""
        ALTER TABLE submissions
          ADD CONSTRAINT chk_submission_status
          CHECK (status IN ('upload_pending', 'pending', 'under_review', 'scored', 'rejected'))
    """)

    # Partial unique index: only one non-rejected, non-upload_pending submission per user per bounty.
    # upload_pending rows are excluded so a user can have an in-flight upload while having no active submission.
    op.execute("""
        CREATE UNIQUE INDEX idx_one_active_submission
          ON submissions(bounty_id, user_id)
          WHERE status NOT IN ('rejected', 'upload_pending')
    """)

    op.execute("CREATE INDEX idx_submissions_bounty_id ON submissions(bounty_id)")
    op.execute("CREATE INDEX idx_submissions_user_id ON submissions(user_id)")
    op.execute("CREATE INDEX idx_submissions_status ON submissions(status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS submissions CASCADE")
