"""Initial schema: users, sessions, orgs, org_members

Revision ID: 001
Revises:
Create Date: 2026-03-25
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email           TEXT NOT NULL UNIQUE,
            username        TEXT NOT NULL UNIQUE,
            password_hash   TEXT NOT NULL,
            display_name    TEXT NOT NULL,
            account_type    TEXT NOT NULL,
            avatar_url      TEXT,
            bio             TEXT,
            location        TEXT,
            skills          TEXT[],
            website_url     TEXT,
            github_url      TEXT,
            linkedin_url    TEXT,
            twitter_url     TEXT,
            email_verified  BOOLEAN NOT NULL DEFAULT false,
            is_active       BOOLEAN NOT NULL DEFAULT true,
            last_seen_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        ALTER TABLE users
            ADD CONSTRAINT chk_account_type
            CHECK (account_type IN ('organizer', 'participant'))
    """)

    op.execute("""
        ALTER TABLE users
            ADD CONSTRAINT chk_username_format
            CHECK (username ~ '^[a-z0-9_-]{3,30}$')
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id      TEXT PRIMARY KEY,
            user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_activity   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at      TIMESTAMPTZ NOT NULL,
            ip_address      TEXT,
            user_agent      TEXT,
            is_revoked      BOOLEAN NOT NULL DEFAULT false
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at) WHERE is_revoked = false")

    op.execute("""
        CREATE TABLE IF NOT EXISTS orgs (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name        TEXT NOT NULL,
            slug        TEXT NOT NULL UNIQUE,
            created_by  UUID NOT NULL REFERENCES users(id),
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS org_members (
            org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role        TEXT NOT NULL,
            joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (org_id, user_id)
        )
    """)

    op.execute("""
        ALTER TABLE org_members
            ADD CONSTRAINT chk_org_role
            CHECK (role IN ('admin', 'moderator'))
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS org_members")
    op.execute("DROP TABLE IF EXISTS orgs")
    op.execute("DROP TABLE IF EXISTS sessions")
    op.execute("DROP TABLE IF EXISTS users")
