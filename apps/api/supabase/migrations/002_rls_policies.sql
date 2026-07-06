-- Migration 002: RLS policies
-- Adiciona policies granulares: user lê/atualiza o próprio perfil; lê o cache (autenticado);
-- lê/cria os próprios snapshots; lê os próprios audit_logs.
-- service_role ignora RLS (escrito pelo Express).
-- Idempotente.

-- users_profile: user lê o próprio + atualiza o próprio
drop policy if exists "users_profile_self_read"   on public.users_profile;
drop policy if exists "users_profile_self_update" on public.users_profile;
create policy "users_profile_self_read"   on public.users_profile for select to authenticated using (auth.uid() = user_id);
create policy "users_profile_self_update" on public.users_profile for update to authenticated using (auth.uid() = user_id);

-- dashboard_cache: leitura autenticada (o backend é o único que escreve via service_role)
drop policy if exists "dashboard_cache_read_authed" on public.dashboard_cache;
create policy "dashboard_cache_read_authed" on public.dashboard_cache for select to authenticated using (true);

-- report_snapshots: user lê e cria os próprios
drop policy if exists "snapshots_self_read"   on public.report_snapshots;
drop policy if exists "snapshots_self_insert" on public.report_snapshots;
drop policy if exists "snapshots_self_delete" on public.report_snapshots;
create policy "snapshots_self_read"   on public.report_snapshots for select to authenticated using (auth.uid() = user_id);
create policy "snapshots_self_insert" on public.report_snapshots for insert to authenticated with check (auth.uid() = user_id);
create policy "snapshots_self_delete" on public.report_snapshots for delete to authenticated using (auth.uid() = user_id);

-- audit_logs: user lê os próprios (somente leitura)
drop policy if exists "audit_self_read" on public.audit_logs;
create policy "audit_self_read" on public.audit_logs for select to authenticated using (auth.uid() = user_id);
