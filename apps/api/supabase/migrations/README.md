# Supabase Migrations

Migrations SQL versionadas e idempotentes para o dashboard Capone.

## Como rodar

### Opção A — SQL editor (manual, mais seguro)
1. Supabase Dashboard → SQL Editor → New query
2. Cole e rode cada arquivo **em ordem**:
   - `001_foundation.sql` — tabelas + RLS enable + trigger
   - `002_rls_policies.sql` — policies granulares
   - `003_auth_config.sql` — checklist de auth (não roda SQL, é manual)

### Opção B — DB direta (automático, requer `SUPABASE_DB_URL`)
1. `SUPABASE_DB_URL` no `apps/api/.env` (Supabase → Project Settings → Database → Connection string → **Direct**, porta 5432)
2. `pnpm --filter @capone/api migrate`
3. O script `scripts/migrate.ts` lê os SQLs e roda via `pg` na ordem

### Opção C — Management API (requer `SUPABASE_ACCESS_TOKEN`)
1. `pnpm --filter @capone/api migrate -- --via=api` (em breve)

## Verificar

```sql
-- Confirmar que as tabelas existem
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('users_profile','dashboard_cache','report_snapshots','audit_logs');
-- Deve retornar 4 linhas

-- Confirmar RLS ativo
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('users_profile','dashboard_cache','report_snapshots','audit_logs');
-- rowsecurity = true em todas
```

## Reaplicar (idempotente)

Todas as migrations usam `create … if not exists`, `drop policy if exists` +
`create policy`, e `drop trigger if exists` + `create trigger`. Pode rodar
quantas vezes quiser.
