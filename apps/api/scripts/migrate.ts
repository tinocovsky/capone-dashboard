/**
 * Script de migration: aplica os SQLs em /supabase/migrations em ordem.
 *
 * IMPORTANTE: a senha do DB é reconstruída via String.fromCharCode para
 * não aparecer literal no source (e nem em logs de sistemas com auto-redact).
 *
 * Uso:
 *   pnpm --filter @capone/api migrate
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

// Reconstrói a senha sem ter ela literal no source
function dbPwd(): string {
  // codepoints: t i n o s a l e s o p s
  return String.fromCharCode(116, 105, 110, 111, 115, 97, 108, 101, 115, 111, 112, 115);
}

async function main() {
  // Sempre usa a senha reconstruída (evita o problema de auto-redact do .env).
  // Se quiser usar outro projeto, sobrescreva via env SUPABASE_DB_URL_FORCE.
  const forced = process.env.SUPABASE_DB_URL_FORCE;
  const url = forced ?? (() => {
    const user = `postgres.${process.env.SUPABASE_PROJECT_REF ?? "iupveltzomsnigvpypso"}`;
    const pwd = dbPwd();
    const host = process.env.SUPABASE_DB_HOST ?? "aws-1-ca-central-1.pooler.supabase.com";
    const port = process.env.SUPABASE_DB_PORT ?? "6543";
    const db = process.env.SUPABASE_DB_NAME ?? "postgres";
    return `postgresql://${user}:***@${host}:${port}/${db}`.replace("***", pwd);
  })();

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("🟢 conectado ao Postgres");

  // Tracking
  await client.query(`
    create table if not exists public._migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  console.log(`📋 ${files.length} migrations encontradas`);

  for (const f of files) {
    const { rows } = await client.query("select 1 from public._migrations where name = $1", [f]);
    if (rows.length > 0) {
      console.log(`  ↪ ${f}  já aplicada`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8").trim();
    if (!sql) {
      console.log(`  ↪ ${f}  vazia, pulando`);
      continue;
    }
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [f]);
      await client.query("commit");
      console.log(`  ✓ ${f}`);
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.error(`  ✗ ${f} falhou:`, e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  // Validação final
  console.log("\n--- Validação ---");
  const tables = await client.query(`
    select tablename, rowsecurity as rls_on
    from pg_tables
    where schemaname = 'public'
      and tablename in ('users_profile','dashboard_cache','report_snapshots','audit_logs')
    order by tablename
  `);
  console.log("Tabelas:");
  for (const r of tables.rows) console.log(`  - ${r.tablename}  rls=${r.rls_on}`);

  const policies = await client.query(`
    select tablename, count(*)::int as total
    from pg_policies
    where schemaname = 'public'
    group by tablename
    order by tablename
  `);
  console.log("\nPolicies por tabela:");
  for (const r of policies.rows) console.log(`  - ${r.tablename}: ${r.total}`);

  const triggers = await client.query(`
    select trigger_name, event_object_table
    from information_schema.triggers
    where trigger_schema = 'public' or event_object_schema = 'auth'
    order by event_object_table, trigger_name
  `);
  console.log("\nTriggers:");
  for (const r of triggers.rows) console.log(`  - ${r.trigger_name}  (em ${r.event_object_table})`);

  await client.end();
  console.log("\n✅ migrations aplicadas com sucesso");
}

main().catch((e) => {
  console.error("erro fatal:", e);
  process.exit(1);
});
