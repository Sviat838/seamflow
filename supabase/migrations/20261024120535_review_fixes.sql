-- Review fixes: delete-proof quota ledger, certificates that snapshot what they certified and who
-- they were issued to, appeal retry bookkeeping, leaderboard counting company-issued certificates.

-- ---------------------------------------------------------------------------
-- 1. Usage ledger: one row per classification, scoped when it happened. Deleting a scan or
--    claiming visitor scans on sign-in never changes it, so the Free plan can't be refilled.
-- ---------------------------------------------------------------------------
create table public.classification_usage (
  id bigint generated always as identity primary key,
  scope text not null check (scope in ('visitor', 'user', 'company')),
  scope_id uuid not null,
  -- No FK on purpose: the row must survive the scan's deletion.
  scan_id uuid,
  created_at timestamptz not null default now()
);

create index classification_usage_scope_idx on public.classification_usage (scope, scope_id);
create unique index classification_usage_scan_key on public.classification_usage (scan_id) where scan_id is not null;

alter table public.classification_usage enable row level security;
revoke all on public.classification_usage from anon, authenticated;

insert into public.classification_usage (scope, scope_id, scan_id, created_at)
select
  case when s.company_id is not null then 'company' when s.user_id is not null then 'user' else 'visitor' end,
  coalesce(s.company_id, s.user_id, s.visitor_id),
  s.id,
  s.created_at
from public.scans s
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Certificates keep the determination they attest to (an overturn rewrites the scan) and the
--    company they were issued to (claiming visitor scans later must not re-attribute them).
-- ---------------------------------------------------------------------------
alter table public.certificates
  add column verdict public.verdict,
  add column policy_clause text,
  add column confidence real,
  add column rating smallint,
  add column rating_note text,
  add column company_id uuid references public.companies (id) on delete set null;

update public.certificates c
   set verdict = s.verdict,
       policy_clause = s.policy_clause,
       confidence = s.confidence,
       rating = s.rating,
       rating_note = s.rating_note,
       company_id = case when c.issued_to <> 'Individual submitter' then s.company_id end
  from public.scans s
 where s.id = c.scan_id;

create function public.certificates_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s record;
begin
  select verdict, policy_clause, confidence, rating, rating_note, company_id
    into s from public.scans where id = new.scan_id;
  new.verdict := coalesce(new.verdict, s.verdict);
  new.policy_clause := coalesce(new.policy_clause, s.policy_clause);
  new.confidence := coalesce(new.confidence, s.confidence);
  new.rating := coalesce(new.rating, s.rating);
  new.rating_note := coalesce(new.rating_note, s.rating_note);
  if new.company_id is null and new.issued_to <> 'Individual submitter' then
    new.company_id := s.company_id;
  end if;
  return new;
end;
$$;

revoke all on function public.certificates_snapshot() from public, anon, authenticated;

create trigger certificates_snapshot before insert on public.certificates
  for each row execute function public.certificates_snapshot();

create index certificates_company_idx on public.certificates (company_id) where company_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Appeals: bounded retries for the background Review Board decision.
-- ---------------------------------------------------------------------------
alter table public.appeals
  add column attempts integer not null default 0 check (attempts >= 0),
  add column last_error text check (char_length(last_error) <= 500);

-- ---------------------------------------------------------------------------
-- 4. Leaderboard: "certified hot dogs" are valid HOT DOG certificates issued to the company.
-- ---------------------------------------------------------------------------
create or replace function public.get_company_leaderboard(p_limit integer default 50)
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
      count(ce.id) filter (where d.verdict = 'hot_dog' and ce.status = 'valid'
        and ce.company_id = d.company_id) as certified
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
