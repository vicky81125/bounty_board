// cleanup-pending-uploads
// Scheduled daily via Supabase cron (pg_cron) or an external scheduler.
//
// What it does:
//   1. Finds submission rows with status = 'pending_upload' older than 24 hours.
//   2. Deletes the corresponding object from the 'submissions' storage bucket (if any).
//   3. Deletes the submission row from the database.
//
// Deploy:
//   supabase functions deploy cleanup-pending-uploads
//
// Invoke manually:
//   supabase functions invoke cleanup-pending-uploads --no-verify-jwt
//
// Schedule (add to Supabase SQL Editor via pg_cron):
//   select cron.schedule(
//     'cleanup-pending-uploads',
//     '0 3 * * *',   -- 3 AM UTC daily
//     $$
//       select net.http_post(
//         url := '<YOUR_SUPABASE_PROJECT_URL>/functions/v1/cleanup-pending-uploads',
//         headers := '{"Authorization": "Bearer <YOUR_ANON_KEY>"}'::jsonb
//       );
//     $$
//   );

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const STALE_HOURS = 24

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString()

  // Fetch stale pending-upload submissions
  const { data: stale, error: fetchErr } = await supabase
    .from("submissions")
    .select("id, storage_path")
    .eq("status", "pending_upload")
    .lt("created_at", cutoff)

  if (fetchErr) {
    console.error("fetch error:", fetchErr.message)
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!stale || stale.length === 0) {
    return new Response(JSON.stringify({ cleaned: 0 }), { status: 200 })
  }

  let cleaned = 0
  const errors: string[] = []

  for (const row of stale) {
    // Delete from storage if a path was recorded
    if (row.storage_path) {
      const { error: storageErr } = await supabase.storage
        .from("submissions")
        .remove([row.storage_path])

      if (storageErr) {
        // Log but continue — the DB row cleanup is more important
        console.warn(`storage remove failed for ${row.id}:`, storageErr.message)
      }
    }

    // Delete the submission row
    const { error: deleteErr } = await supabase
      .from("submissions")
      .delete()
      .eq("id", row.id)
      .eq("status", "pending_upload") // Safety guard: only delete if still pending

    if (deleteErr) {
      errors.push(`${row.id}: ${deleteErr.message}`)
    } else {
      cleaned++
    }
  }

  console.log(`cleanup-pending-uploads: cleaned ${cleaned}/${stale.length}`)

  return new Response(
    JSON.stringify({ cleaned, total: stale.length, errors }),
    { status: errors.length > 0 ? 207 : 200 }
  )
})
