-- Seamflow core schema: profiles, scans, rate limits, global stats, scans storage bucket.
--
-- Access model: the Next.js server does every write with the secret (service-role) key.
-- Browser roles only get read access to their own rows, plus the aggregate stats RPC.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.verdict as enum ('hot_dog', 'not_hot_dog');
create type public.scan_feedback as enum ('correct', 'incorrect');

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, filled from the OAuth identity on sign-up.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- scans: one row per classified image.
-- Owner is user_id when signed in, otherwise the anonymous visitor cookie id.
-- ---------------------------------------------------------------------------
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  share_slug text not null unique
    default translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_'),
  user_id uuid references auth.users (id) on delete cascade,
  visitor_id uuid,
  verdict public.verdict not null,
  confidence real not null check (confidence >= 0 and confidence <= 1),
  summary text not null check (char_length(summary) <= 500),
  details jsonb not null default '{}'::jsonb,
  image_path text,
  image_mime text,
  image_bytes integer check (image_bytes > 0),
  image_sha256 text,
  model text not null,
  latency_ms integer check (latency_ms >= 0),
  is_public boolean not null default false,
  feedback public.scan_feedback,
  feedback_at timestamptz,
  ip_hash text,
  request_id text,
  created_at timestamptz not null default now(),
  constraint scans_has_owner check (user_id is not null or visitor_id is not null)
);

comment on column public.scans.details is
  'Full Classification payload from the AI classifier (reasoning, detectedItems, flags, cached).';
comment on column public.scans.visitor_id is
  'Opaque id from the httpOnly sf_vid cookie for anonymous visitors. Never exposed to clients.';
comment on column public.scans.image_sha256 is
  'Hex SHA-256 of the uploaded bytes; lets identical images reuse a prior verdict.';

create index scans_user_created_idx on public.scans (user_id, created_at desc)
  where user_id is not null;
create index scans_visitor_created_idx on public.scans (visitor_id, created_at desc)
  where visitor_id is not null;
create index scans_image_sha256_idx on public.scans (image_sha256)
  where image_sha256 is not null;
create index scans_created_idx on public.scans (created_at desc);

alter table public.scans enable row level security;

create policy scans_select_own on public.scans
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Rate limiting: fixed-window counters, server-only.
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

create function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_limit <= 0 or p_window_seconds <= 0 or p_window_seconds > 86400 then
    raise exception 'consume_rate_limit: invalid limit % / window %', p_limit, p_window_seconds;
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limits as rl (key, window_start, hits)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  -- Opportunistic cleanup of expired windows on ~1% of calls.
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '2 days';
  end if;

  return query select
    v_hits <= p_limit,
    greatest(p_limit - v_hits, 0),
    v_window_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Global stats: aggregate counts only, safe for anonymous callers.
-- ---------------------------------------------------------------------------
create function public.get_global_stats()
returns table (
  total_scans bigint,
  hot_dog_scans bigint,
  not_hot_dog_scans bigint,
  scans_last_24h bigint,
  feedback_correct bigint,
  feedback_incorrect bigint
)
language sql stable security definer set search_path = '' as $$
  select
    count(*),
    count(*) filter (where s.verdict = 'hot_dog'),
    count(*) filter (where s.verdict = 'not_hot_dog'),
    count(*) filter (where s.created_at > now() - interval '24 hours'),
    count(*) filter (where s.feedback = 'correct'),
    count(*) filter (where s.feedback = 'incorrect')
  from public.scans s;
$$;

revoke all on function public.get_global_stats() from public;
grant execute on function public.get_global_stats() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket; the server uploads and hands out signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
