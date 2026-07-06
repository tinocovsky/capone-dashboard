# @capone/web

Next.js 15 (App Router) + Supabase Auth + dashboard dark Capone Club.

## Setup

```bash
cp ../../.env.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_API_BASE

pnpm dev
# http://localhost:3000
```

## Auth

- Email/senha + magic link (Supabase)
- Middleware em `src/middleware.ts` protege todas as rotas (exceto `/login`, `/auth/*`)
- O access_token é enviado no header `Authorization` para a API Express

## Configurar Supabase

1. Crie o projeto em supabase.com
2. SQL editor: cole `../api/supabase/schema.sql` → Run
3. Authentication → URL Configuration: adicione `http://localhost:3000/auth/callback`
4. Email templates: personalize o Magic Link template
