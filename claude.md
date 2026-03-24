# bounty_board

## Git Rules

NEVER commit or push anything to git. Do not run `git commit`, `git push`, `git add`, or any destructive git operations. If changes need to be committed, tell the user what to commit and let them do it manually.

## Supabase Rules

Never run Supabase migrations or scripts directly. Instead, provide SQL scripts or Edge Function code that the user can copy-paste and run themselves in the Supabase dashboard (SQL Editor or Edge Functions UI). Always present Supabase code as a copyable block with clear instructions on where to run it.
