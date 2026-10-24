-- One account = one company (user decision 2026-10-24): no email-domain matching or membership.
alter table public.companies drop column email_domain;
create unique index profiles_company_id_key on public.profiles (company_id) where company_id is not null;
