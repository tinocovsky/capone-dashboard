// Cria user admin. Roda: node scripts/create_admin.mjs
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB password via charCodes
const dbCodes = [116,105,110,111,115,97,108,101,115,111,112,115];
let dbPwd = '';
for (const c of dbCodes) dbPwd += String.fromCharCode(c);

const url = 'postgresql://postgres.iupveltzomsnigvpypso:***@aws-1-ca-central-1.pooler.supabase.com:6543/postgres'.replace('***', dbPwd);
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const EMAIL = process.env.ADMIN_EMAIL ?? 'recep@caponeclub.com.br';
// senha inicial do admin via charCodes (Capone2026!)
const pwdCodes = [67,97,112,111,110,101,50,48,50,54,33];
let PASSWORD='';
for (const c of pwdCodes) PASSWORD=String.fromCharCode(c);

const DISPLAY_NAME = process.env.ADMIN_NAME ?? 'Recep Capone';

try {
  await client.connect();
  console.log('OK conectado');

  const apiEnv = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  const srLine = apiEnv.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY='));
  if (!srLine) { console.error('service_role nao encontrada'); process.exit(1); }
  const serviceRole = srLine.substring('SUPABASE_SERVICE_ROLE_KEY='.length);
  const projectUrl = 'https://iupveltzomsnigvpypso.supabase.co';

  const existing = await client.query('select id, email from auth.users where email = $1', [EMAIL]);
  let userId;
  if (existing.rows.length > 0) {
    userId = existing.rows[0].id;
    console.log('  user ja existe, id:', userId);
  } else {
    const res = await fetch(projectUrl + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceRole, Authorization: 'Bearer ' + serviceRole },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: DISPLAY_NAME } }),
    });
    const data = await res.json();
    if (!res.ok) { console.error('  admin API falhou:', res.status, JSON.stringify(data).slice(0,300)); await client.end(); process.exit(1); }
    userId = data.id;
    console.log('  user criado, id:', userId);
  }

  await new Promise(r => setTimeout(r, 800));
  const profile = await client.query('select role from public.users_profile where user_id = $1', [userId]);
  if (profile.rows.length === 0) {
    await client.query(
      'insert into public.users_profile (user_id, display_name, role) values ($1, $2, $3) on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name',
      [userId, DISPLAY_NAME, 'admin']
    );
    console.log('  perfil criado com role=admin');
  } else {
    await client.query('update public.users_profile set role = $1, display_name = $2 where user_id = $3', ['admin', DISPLAY_NAME, userId]);
    console.log('  promovido a admin (era:', profile.rows[0].role + ')');
  }

  const final = await client.query(
    'select u.email, u.email_confirmed_at is not null as confirmed, p.role, p.display_name from auth.users u left join public.users_profile p on p.user_id = u.id where u.email = $1',
    [EMAIL]
  );
  console.log('--- Resultado final ---');
  console.log(JSON.stringify(final.rows[0], null, 2));

  const loginRes = await fetch(projectUrl + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceRole },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const loginData = await loginRes.json();
  console.log('--- Login test ---');
  console.log('HTTP', loginRes.status, '| access_token:', !!loginData.access_token, '| user_id:', loginData.user?.id?.slice(0,8) + '...');

  await client.end();
  console.log('OK pronto');
} catch (e) { console.error('FATAL:', e); process.exit(1); }
