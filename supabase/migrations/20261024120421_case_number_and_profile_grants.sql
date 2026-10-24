-- lpad() truncates longer strings, so case numbers would collide from sequence 10000 on.
-- The sequence starts at 7001, so plain text is always at least four digits.
alter table public.scans alter column case_number
  set default ('HDX-' || to_char(now() at time zone 'utc', 'YYYY-MMDD') || '-' || nextval('public.scan_case_seq')::text);
alter table public.scans
  add constraint scans_case_number_format check (case_number ~ '^HDX-[0-9]{4}-[0-9]{4}-[0-9]{4,}$');

-- The server writes company_id / company_role with the secret key and trusts them for access
-- and quota; browser roles may only edit their display fields.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
