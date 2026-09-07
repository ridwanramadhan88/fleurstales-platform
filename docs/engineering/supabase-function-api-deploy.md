# Supabase Edge Function CI deployment

GitHub Actions deploys Fleurstales Edge Functions with `supabase functions deploy --use-api`.

This uses Supabase's server-side bundling API instead of pulling the Edge Runtime Docker image on the GitHub runner. It avoids transient public container-registry throttling such as `docker: toomanyrequests: Rate exceeded` during production and staging releases.

Local development and local function serving may still use Docker.
