-- HDX v2: companies, HDX ratings and policy clauses, case numbers, certificates, appeals,
-- a hash-chained audit trail, sales leads, and leaderboard/stats RPCs.
-- Same access model as before: the Next.js server writes with the secret key; browser roles
-- get at most read access to their own (or their company's) rows.

-- ---------------------------------------------------------------------------
-- companies: every signed-in account belongs to one (chosen at onboarding).
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
  -- Work email domain of the creator (null for public providers). Same-domain users auto-join.
  email_domain text unique check (email_domain is null or email_domain = lower(email_domain)),
  created_by uuid references auth.users (id) on delete set null,
  plan text not null default 'free' check (plan in ('free', 'business')),
  -- Owners can hide the company from the public leaderboard.
  is_listed boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index companies_name_key on public.companies (lower(btrim(name)));

alter table public.profiles
  add column company_id uuid references public.companies (id) on delete set null,
  add column company_role text check (company_role in ('owner', 'member')),
  add column job_title text check (char_length(job_title) <= 80);

create index profiles_company_idx on public.profiles (company_id) where company_id is not null;

alter table public.companies enable row level security;

create policy companies_select_member on public.companies
  for select to authenticated
  using (id = (select p.company_id from public.profiles p where p.id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- scans: case numbers, company attribution, rating, policy clause, region, retention, review.
-- ---------------------------------------------------------------------------
create sequence public.scan_case_seq start 7001;

alter table public.scans
  add column case_number text unique
    default ('HDX-' || to_char(now() at time zone 'utc', 'YYYY-MMDD') || '-'
      || lpad(nextval('public.scan_case_seq')::text, 4, '0')),
  add column company_id uuid references public.companies (id) on delete set null,
  -- HDX Rating: how canonical a hot dog is under Policy v3.2. HOT DOG verdicts only.
  add column rating smallint check (rating between 0 and 100),
  add column rating_note text check (char_length(rating_note) <= 200),
  -- Clause id from src/lib/policy.ts, e.g. "2.1".
  add column policy_clause text check (policy_clause ~ '^[0-9]+\.[0-9]+$'),
  -- Coarse processing region shown in the public feed, e.g. "EU-C".
  add column region text check (char_length(region) <= 8),
  add column file_name text check (char_length(file_name) <= 120),
  add column image_deleted_at timestamptz,
  add column review_status text check (review_status in ('pending', 'upheld', 'overturned'));

alter table public.scans alter column case_number set not null;
alter table public.scans
  add constraint scans_rating_only_for_hot_dogs check (rating is null or verdict = 'hot_dog');

create index scans_company_created_idx on public.scans (company_id, created_at desc)
  where company_id is not null;
create index scans_image_retention_idx on public.scans (created_at)
  where image_path is not null and image_deleted_at is null;

create policy scans_select_company on public.scans
  for select to authenticated
  using (
    company_id is not null
    and company_id = (select p.company_id from public.profiles p where p.id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- certificates: one per persisted scan; public record at /v/{code}.
-- ---------------------------------------------------------------------------
create function public.generate_certificate_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  -- Crockford-style alphabet: no 0/O, 1/I/L or U, so printed codes survive bad handwriting.
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 30) + 1, 1);
    if i = 3 then
      code := code || '-';
    end if;
  end loop;
  return code;
end;
$$;

revoke all on function public.generate_certificate_code() from public, anon, authenticated;
grant execute on function public.generate_certificate_code() to service_role;

create sequence public.certificate_number_seq start 88301;

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans (id) on delete cascade,
  number text not null unique
    default ('HDX-C-' || lpad(nextval('public.certificate_number_seq')::text, 7, '0')),
  code text not null unique default public.generate_certificate_code()
    check (code ~ '^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$'),
  -- Company name at issue time, or "Individual submitter".
  issued_to text not null check (char_length(issued_to) <= 120),
  product_name text check (char_length(product_name) <= 80),
  sku text check (char_length(sku) <= 40),
  status text not null default 'valid' check (status in ('valid', 'revoked')),
  revoked_at timestamptz,
  revoked_reason text check (char_length(revoked_reason) <= 300),
  verification_count integer not null default 0 check (verification_count >= 0),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint certificates_revocation_consistent check ((status = 'revoked') = (revoked_at is not null))
);

alter table public.certificates enable row level security;

-- Atomic scan counter for the public verify page.
create function public.record_certificate_verification(p_code text)
returns setof public.certificates
language sql volatile security definer set search_path = '' as $$
  update public.certificates
     set verification_count = verification_count + 1,
         last_verified_at = now()
   where code = upper(btrim(p_code))
  returning *;
$$;

revoke all on function public.record_certificate_verification(text) from public, anon, authenticated;
grant execute on function public.record_certificate_verification(text) to service_role;

-- ---------------------------------------------------------------------------
-- appeals: "Request human review", decided by the Hot Dog Review Board. One per scan.
-- ---------------------------------------------------------------------------
create table public.appeals (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  visitor_id uuid,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'upheld', 'overturned')),
  ruling text check (char_length(ruling) <= 1000),
  reviewer_model text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint appeals_has_owner check (user_id is not null or visitor_id is not null)
);

create unique index appeals_scan_key on public.appeals (scan_id);

alter table public.appeals enable row level security;

-- ---------------------------------------------------------------------------
-- audit_events: append-only, SHA-256 chained per scan by a trigger.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  scan_id uuid not null references public.scans (id) on delete cascade,
  event text not null check (event in (
    'uploaded', 'screened', 'classified', 'certificate_issued', 'product_updated',
    'appeal_filed', 'appeal_upheld', 'appeal_overturned', 'certificate_revoked', 'image_deleted'
  )),
  actor text not null check (char_length(actor) <= 120),
  detail text not null check (char_length(detail) <= 500),
  occurred_at timestamptz not null default clock_timestamp(),
  prev_hash text,
  hash text not null
);

create index audit_events_scan_idx on public.audit_events (scan_id, id);

alter table public.audit_events enable row level security;

create function public.audit_events_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize appends per scan so two writers can't fork the chain.
  perform pg_advisory_xact_lock(hashtextextended(new.scan_id::text, 0));
  select e.hash into new.prev_hash
    from public.audit_events e
   where e.scan_id = new.scan_id
   order by e.id desc
   limit 1;
  new.hash := encode(extensions.digest(
    coalesce(new.prev_hash, '') || '|' || new.scan_id::text || '|' || new.event || '|'
      || new.actor || '|' || new.detail || '|'
      || to_char(new.occurred_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'sha256'), 'hex');
  return new;
end;
$$;

revoke all on function public.audit_events_chain() from public, anon, authenticated;

create trigger audit_events_chain before insert on public.audit_events
  for each row execute function public.audit_events_chain();

-- Immutable: no updates or deletes except the FK cascade when a scan is deleted.
revoke update, delete, truncate on public.audit_events from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- leads: Business-plan "Contact us" form.
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (char_length(email) <= 254 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  company text not null check (char_length(btrim(company)) between 1 and 120),
  role text check (char_length(role) <= 120),
  monthly_volume text check (monthly_volume in ('<1k', '1k-10k', '10k-100k', '100k-1m', '>1m')),
  use_case text check (char_length(use_case) <= 2000),
  source text check (char_length(source) <= 40),
  user_id uuid references auth.users (id) on delete set null,
  ip_hash text,
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

-- ---------------------------------------------------------------------------
-- Stats v2: adds today's counts (UTC) and p50 latency over the last 7 days.
-- ---------------------------------------------------------------------------
drop function public.get_global_stats();

create function public.get_global_stats()
returns table (
  total_scans bigint,
  hot_dog_scans bigint,
  not_hot_dog_scans bigint,
  scans_last_24h bigint,
  scans_today bigint,
  hot_dog_scans_today bigint,
  feedback_correct bigint,
  feedback_incorrect bigint,
  p50_latency_ms integer
)
language sql stable security definer set search_path = '' as $$
  select
    count(*),
    count(*) filter (where s.verdict = 'hot_dog'),
    count(*) filter (where s.verdict = 'not_hot_dog'),
    count(*) filter (where s.created_at > now() - interval '24 hours'),
    count(*) filter (where s.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
    count(*) filter (where s.verdict = 'hot_dog'
      and s.created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'),
    count(*) filter (where s.feedback = 'correct'),
    count(*) filter (where s.feedback = 'incorrect'),
    (percentile_cont(0.5) within group (order by s.latency_ms)
      filter (where s.latency_ms is not null and s.created_at > now() - interval '7 days'))::integer
  from public.scans s;
$$;

revoke all on function public.get_global_stats() from public, anon, authenticated;
grant execute on function public.get_global_stats() to service_role;

-- ---------------------------------------------------------------------------
-- Company leaderboard: Bayesian-smoothed mean HDX Rating (prior weight 5 at the global
-- mean), so one lucky photo can't top the table. Identical images count once per company.
-- ---------------------------------------------------------------------------
create function public.get_company_leaderboard(p_limit integer default 50)
returns table (
  company_id uuid,
  name text,
  slug text,
  score numeric,
  rated_hot_dogs bigint,
  certified_hot_dogs bigint,
  total_scans bigint,
  hot_dog_share numeric,
  last_activity timestamptz
)
language sql stable security definer set search_path = '' as $$
  with listed as (
    select c.id, c.name, c.slug from public.companies c where c.is_listed
  ),
  distinct_images as (
    select distinct on (s.company_id, coalesce(s.image_sha256, s.id::text))
      s.id, s.company_id, s.verdict, s.rating
    from public.scans s
    join listed l on l.id = s.company_id
    order by s.company_id, coalesce(s.image_sha256, s.id::text), s.created_at desc
  ),
  prior as (
    select coalesce(avg(d.rating), 75)::numeric as mean
    from distinct_images d
    where d.verdict = 'hot_dog' and d.rating is not null
  ),
  ratings as (
    select d.company_id,
      count(d.rating) filter (where d.verdict = 'hot_dog') as rated,
      coalesce(sum(d.rating) filter (where d.verdict = 'hot_dog'), 0) as rating_sum,
      count(ce.id) filter (where d.verdict = 'hot_dog' and ce.status = 'valid') as certified
    from distinct_images d
    left join public.certificates ce on ce.scan_id = d.id
    group by d.company_id
  ),
  activity as (
    select s.company_id,
      count(*) as total_scans,
      count(*) filter (where s.verdict = 'hot_dog') as hot_dogs,
      max(s.created_at) as last_activity
    from public.scans s
    join listed l on l.id = s.company_id
    group by s.company_id
  )
  select l.id, l.name, l.slug,
    round((5 * p.mean + r.rating_sum) / (5 + r.rated), 1) as score,
    r.rated, r.certified, a.total_scans,
    round(a.hot_dogs::numeric / a.total_scans, 3),
    a.last_activity
  from listed l
  join activity a on a.company_id = l.id
  join ratings r on r.company_id = l.id
  cross join prior p
  where a.hot_dogs > 0
  order by score desc, r.rated desc, a.last_activity desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.get_company_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.get_company_leaderboard(integer) to service_role;
