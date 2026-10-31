create extension if not exists pgcrypto;

create type visitor_status as enum ('pending', 'approved', 'rejected', 'entered', 'exited');

create table public.visitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  company text not null,
  host text not null,
  purpose text not null,
  approver_emails text[] not null default '{}',
  status visitor_status not null default 'pending',
  created_by uuid not null references auth.users(id),
  approved_by text,
  decision_at timestamptz,
  entered_at timestamptz,
  exited_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.company_approvers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.visitors enable row level security;
alter table public.company_approvers enable row level security;
create policy "authenticated users can read visitors" on public.visitors for select to authenticated using (true);
create policy "watchmen can create visitors" on public.visitors for insert to authenticated with check (created_by = auth.uid());
create policy "authenticated users can read approvers" on public.company_approvers for select to authenticated using (true);
create policy "admins can manage approvers" on public.company_approvers for all to authenticated using (true) with check (true);
create or replace function public.decide_visitor(visitor_id uuid, new_status visitor_status)
returns void language plpgsql security definer set search_path = public as $$
begin
  if new_status not in ('approved', 'rejected') then raise exception 'Invalid decision'; end if;
  update visitors set status = new_status, approved_by = auth.email(), decision_at = now()
    where id = visitor_id and status = 'pending';
  if not found then raise exception 'Visitor is not pending or does not exist'; end if;
end; $$;
revoke all on function public.decide_visitor(uuid, visitor_status) from public;
grant execute on function public.decide_visitor(uuid, visitor_status) to authenticated;

create or replace function public.notify_new_visitor() returns trigger
language plpgsql security definer as $$
begin
  perform net.http_post(
    url := current_setting('app.settings.notification_function_url', true),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('visitor_id', new.id)
  );
  return new;
end; $$;
-- Configure the function URL and enable this trigger after deploying the edge function.
