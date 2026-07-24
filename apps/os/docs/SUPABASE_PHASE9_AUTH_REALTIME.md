# Phase 9 — Auth/session + Realtime preparation

Phase 9 deliberately does **not** enable a live Supabase project or replace the current Fleurstales login.
It makes the Business OS and Online Store use the same session/realtime contracts before the backend exists.

## Staff session contract

Application/domain code sees one `SharedSession`:

- `anonymous` — Online Store/public context.
- `local_demo` — current local Business OS login.
- `legacy_shared_backend` — current optional prototype backend login.
- `supabase` — future authenticated Supabase staff session.

A live Supabase identity is resolved through `staff_access_profiles` using the protected
`get_current_staff_access_profile()` RPC. The browser access token is never interpreted as the role authority;
the database mapping is authoritative.

The mapping is one Supabase Auth user → at most one Fleurstales employee, and one employee → at most one
Supabase Auth user.

## Token lifecycle

`supabaseSession.ts` stores only the browser access-token snapshot required by the prepared HTTP transport.
Phase 9 does not implement password sign-in, refresh tokens, or token rotation. Those belong to the live Auth
adapter when a Supabase project is attached.

Sign-out must clear both the Supabase browser session and the shared staff session.

## Realtime contract

App code subscribes by shared domain, not raw table:

- `catalog`
- `store`
- `customers`
- `orders`
- `staff_session`

Realtime events are invalidation signals only. After an event, the relevant repository is re-read; event payloads
never become authoritative application data by themselves.

`realtimeLocalAdapter.ts` implements the same contract with `BroadcastChannel` for Phase 10 local/parity QA.
The future live Supabase adapter can use `@supabase/supabase-js` without changing domain bridges or UI code.

## Security

`staff_access_profiles` remains RLS-protected. Anonymous Storefront users never receive staff identity data.
The new session RPC is executable only by `authenticated`.


## Legacy order stream

`src/core/realtime/sharedBackend.ts` is the pre-Supabase prototype SSE transport. It remains available so the
current demo/backend workflow is not broken, but it is marked deprecated. Do not run it alongside the future
Supabase Realtime adapter for the same Orders domain; Phase 13 will switch the transport and remove the legacy path.
