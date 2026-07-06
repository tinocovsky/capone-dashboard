-- Migration 001: foundation
-- Cria extensão pgcrypto (gen_random_uuid), tabelas base e trigger de perfil.
-- Idempotente: pode rodar múltiplas vezes.

-- 1) Extensões
create extension if not exists "pgcrypto";

-- 2) users_profile: extensão 1:1 com auth.users
create table if not exists public.users_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists users_profile_role_idx on public.users_profile (role);

-- 3) dashboard_cache: 1 linha por (period_start, period_end); TTL 5 min aplicado pelo backend
create table if not exists public.dashboard_cache (
  period_start date not null,
  period_end   date not null,
  report       jsonb not null,
  generated_at timestamptz not null default now(),
  primary key (period_start, period_end)
);

-- 4) report_snapshots: histórico (user-clicou-em-salvar)
create table if not exists public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  report       jsonb not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists report_snapshots_user_idx on public.report_snapshots (user_id, created_at desc);
create index if not exists report_snapshots_period_idx on public.report_snapshots (period_start, period_end);

-- 5) audit_logs: 1 linha por ação relevante
create table if not exists public.audit_logs (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  meta jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id, at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, at desc);

-- 6) RLS: habilitar (mas SEM policies = ninguém lê via PostgREST, exceto service_role)
alter table public.users_profile     enable row level security;
alter table public.dashboard_cache   enable row level security;
alter table public.report_snapshots  enable row level security;
alter table public.audit_logs        enable row level security;

-- 7) Grants: anon NÃO tem acesso a nada. authenticated tem SELECT onde faz sentido.
revoke all on public.users_profile    from anon, authenticated;
revoke all on public.dashboard_cache  from anon, authenticated;
revoke all on public.report_snapshots from anon, authenticated;
revoke all on public.audit_logs       from anon, authenticated;

-- service_role (usado pelo Express) ignora RLS por design, então não precisa grant.

-- 8) Trigger: cria users_profile automático no signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users_profile (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
