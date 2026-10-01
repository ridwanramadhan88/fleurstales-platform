-- Staff/customer login sessions live at most 12 hours (one shift). Supabase's built-in
-- time-box / inactivity settings are Pro-plan only, so enforce the same limit with pg_cron.
-- A deleted session cannot refresh its token, so the browser must sign in again once its
-- current access token expires.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'expire-auth-sessions-12h';

select cron.schedule(
  'expire-auth-sessions-12h',
  '*/15 * * * *',
  $job$delete from auth.sessions where created_at < now() - interval '12 hours'$job$
);
