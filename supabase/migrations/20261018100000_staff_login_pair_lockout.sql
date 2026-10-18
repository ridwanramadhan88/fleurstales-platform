-- Staff login throttling: lock the (username + IP) pair instead of the bare username,
-- so an outsider guessing a known username can no longer lock the real staff member out.
-- A looser per-username ceiling and a per-IP ceiling still bound distributed guessing.
alter table private.staff_login_rate_limits drop constraint if exists staff_login_rate_limits_scope_check;
alter table private.staff_login_rate_limits
  add constraint staff_login_rate_limits_scope_check check(scope in ('username','ip','pair'));

create or replace function public.service_consume_staff_login_attempt(p_username text,p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_ip_hash text:=lower(trim(coalesce(p_ip_hash,'')));
  v_username_key text;
  v_ip_key text;
  v_pair_key text;
  v_locks timestamptz[];
  v_lock timestamptz;
begin
  if v_username !~ '^[a-z][a-z0-9._-]*$' or v_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('allowed',false,'retryAfterSeconds',900);
  end if;
  v_username_key:=encode(extensions.digest(v_username,'sha256'::text),'hex');
  v_ip_key:=encode(extensions.digest(v_ip_hash,'sha256'::text),'hex');
  v_pair_key:=encode(extensions.digest(v_username||':'||v_ip_hash,'sha256'::text),'hex');
  v_locks:=array[
    private.consume_staff_login_scope('pair',v_pair_key,5),
    private.consume_staff_login_scope('username',v_username_key,30),
    private.consume_staff_login_scope('ip',v_ip_key,30)
  ];
  select max(l) into v_lock from unnest(v_locks) as l;
  delete from private.staff_login_rate_limits where updated_at<clock_timestamp()-interval '2 days';
  return jsonb_build_object(
    'allowed',v_lock is null,
    'retryAfterSeconds',case when v_lock is null then 0 else greatest(1,ceil(extract(epoch from (v_lock-clock_timestamp())))::integer) end
  );
end;
$$;
revoke execute on function public.service_consume_staff_login_attempt(text,text) from public,anon,authenticated;
grant execute on function public.service_consume_staff_login_attempt(text,text) to service_role;

create or replace function public.service_clear_staff_login_attempts(p_username text,p_ip_hash text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_ip_hash text:=lower(trim(coalesce(p_ip_hash,'')));
begin
  delete from private.staff_login_rate_limits
  where (scope='pair' and key_hash=encode(extensions.digest(v_username||':'||v_ip_hash,'sha256'::text),'hex'))
     or (scope='username' and key_hash=encode(extensions.digest(v_username,'sha256'::text),'hex'))
     or (scope='ip' and key_hash=encode(extensions.digest(v_ip_hash,'sha256'::text),'hex'));
end;
$$;
revoke execute on function public.service_clear_staff_login_attempts(text,text) from public,anon,authenticated;
grant execute on function public.service_clear_staff_login_attempts(text,text) to service_role;
