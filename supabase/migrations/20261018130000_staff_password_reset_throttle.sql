-- Rate limit for "forgot password by username". Reuses the existing throttle
-- storage with its own key namespace ('reset:' prefix) so it never shares
-- counters with sign-in attempts.
create or replace function public.service_consume_staff_reset_attempt(p_username text,p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_ip_hash text:=lower(trim(coalesce(p_ip_hash,'')));
  v_user_lock timestamptz;
  v_ip_lock timestamptz;
  v_lock timestamptz;
begin
  if v_username !~ '^[a-z][a-z0-9._-]*$' or v_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',900);
  end if;
  v_user_lock:=private.consume_staff_login_scope('username',encode(extensions.digest('reset:'||v_username,'sha256'::text),'hex'),3);
  v_ip_lock:=private.consume_staff_login_scope('ip',encode(extensions.digest('reset:'||v_ip_hash,'sha256'::text),'hex'),10);
  v_lock:=greatest(v_user_lock,v_ip_lock);
  return jsonb_build_object(
    'allowed',v_lock is null,
    'retryAfterSeconds',case when v_lock is null then 0 else greatest(1,ceil(extract(epoch from (v_lock-clock_timestamp())))::integer) end
  );
end;
$$;
revoke execute on function public.service_consume_staff_reset_attempt(text,text) from public,anon,authenticated;
grant execute on function public.service_consume_staff_reset_attempt(text,text) to service_role;
