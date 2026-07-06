# @capone/api

Express + TypeScript. Backend do dashboard Capone Club.

## Setup

```bash
# 1) Variáveis de ambiente
cp ../../.env.example .env
# preencha GHL_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# GHL_LOCATION_ID, GHL_PIPELINE_VENDAS, GHL_PIPELINE_POS_VENDAS

# 2) Rodar o schema no Supabase (SQL editor)
psql $DATABASE_URL -f supabase/schema.sql
# ou cole o conteúdo no painel do Supabase

# 3) Dev
pnpm dev
# API em http://localhost:4000
```

## Endpoints

| Método | Rota                          | Auth | Descrição |
|--------|-------------------------------|------|-----------|
| GET    | `/health`                     | —    | Liveness |
| GET    | `/api/reports?start=&end=`    | JWT  | Relatório (cache 5 min) |
| POST   | `/api/reports/snapshot`       | JWT  | Salva snapshot histórico |
| GET    | `/api/reports/snapshots`      | JWT  | Lista snapshots do user |

## Notas críticas

- **GHL paginação**: o client em `src/ghl.ts` segue `response.meta.nextPageUrl`.
  Nunca construir `startAfter` à mão. Para `/opportunities/search` o `startAfter`
  é número em ms epoch. `/contacts/search` não tem `date_added` confiável — filtra local.
- **Cloudflare 1010**: User-Agent de browser é obrigatório (já configurado).
