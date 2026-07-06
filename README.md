# Capone Club — Dashboard GHL

Monorepo para o dashboard mensal de Vendas + Pós-vendas (tatuagem).

## Stack
- **apps/web** — Next.js 15 (App Router) + Supabase Auth (email/senha + magic link)
- **apps/api** — Express + TypeScript, busca dados ao vivo do LeadConnector/GHL
- **packages/shared** — tipos e schemas Zod (Report, Totals, etc.)
- **Supabase** — auth, cache do relatório, snapshots históricos, audit log, RLS

## Setup rápido

```bash
# 1) Instalar
cd ~/capone-dashboard
pnpm install

# 2) Env files
cp .env.example apps/api/.env
cp .env.example apps/web/.env.local
# preencha os dois com seus valores reais (GHL token, Supabase URL/keys, pipeline IDs)

# 3) Schema do Supabase
#    Supabase dashboard → SQL editor → cole apps/api/supabase/schema.sql → Run

# 4) Dev (frontend + backend juntos)
pnpm dev
# web: http://localhost:3000  |  api: http://localhost:4000
```

## Configurar Supabase Auth

1. Authentication → URL Configuration → adicione `http://localhost:3000/auth/callback`
2. (opcional) Authentication → Providers → habilite Google
3. (opcional) Email Templates → personalize o Magic Link

## Ajustes necessários

| O quê | Onde |
|-------|------|
| Pipeline IDs (Vendas, Pós vendas) | `apps/api/src/env.ts` → `GHL_PIPELINE_VENDAS`, `GHL_PIPELINE_POS_VENDAS` |
| Location ID do GHL | `GHL_LOCATION_ID` |
| Custom field "Artista escolhido" | `GHL_ARTIST_FIELD_ID` (default `9XPhm85vxOYEyZ6yRB9N`) |
| Mapeamento pipeline ID → nome | `apps/web/src/app/dashboard.tsx` → `PIPELINE_LABEL` |

## Lições aplicadas (do histórico)

- GHL paginação: client em `apps/api/src/ghl.ts` segue `response.meta.nextPageUrl` — nunca constrói `startAfter` à mão. Para opps, `startAfter` é número ms epoch.
- Cloudflare 1010: User-Agent de browser obrigatório (configurado em `ghl.ts`).
- `/contacts/search` filtros `date_added` quebram — filtramos local.

## Estrutura

```
capone-dashboard/
├── apps/
│   ├── api/        Express + GHL + Supabase
│   └── web/        Next.js 15 + Supabase Auth
├── packages/
│   └── shared/     tipos compartilhados (zod)
└── .env.example
```

## Endpoints da API

| Método | Rota | Auth | |
|--------|------|------|---|
| GET | `/health` | — | liveness |
| GET | `/api/reports?start=YYYY-MM-DD&end=YYYY-MM-DD` | JWT | relatório (cache 5min) |
| POST | `/api/reports/snapshot` | JWT | salva snapshot do user |
| GET | `/api/reports/snapshots` | JWT | lista snapshots do user |
