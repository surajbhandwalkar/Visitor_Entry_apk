create table if not exists public.company_approvers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.company_approvers enable row level security;
drop policy if exists "authenticated users can read approvers" on public.company_approvers;
drop policy if exists "admins can manage approvers" on public.company_approvers;
create policy "authenticated users can read approvers" on public.company_approvers for select to authenticated using (true);
create policy "admins can manage approvers" on public.company_approvers for all to authenticated using (true) with check (true);
