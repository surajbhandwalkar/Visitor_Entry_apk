alter table public.visitors
  add column if not exists approver_emails text[] not null default '{}';
