# ============================================================
# Dockerfile — Capone API (deploy no Railway)
# ============================================================
# Build stage: pnpm install + tsc build do monorepo.
# Runtime: Node 20 LTS + arquivos compilados + serve via Express.
# Dockerfile é explícito (sem corepack, sem nixpacks auto-detect) para
# evitar bugs intermitentes de versão em CI.
# ============================================================

FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Corepack para ativar pnpm conforme declarado em package.json#packageManager
RUN corepack enable

# Copia manifesto primeiro pra cache eficiente.
# Destino precisa terminar com `/` pq são múltiplos sources.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json /app/
COPY apps/api/package.json /app/apps/api/
COPY packages/shared/package.json /app/packages/shared/

# Install — usa pnpm com frozen lockfile pra reprodutibilidade
RUN pnpm install --frozen-lockfile

# Copia o source e compila
COPY packages/shared /app/packages/shared
COPY apps/api /app/apps/api
RUN pnpm --filter @capone/api build


# Runtime stage: imagem magra só com prod deps + build output
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Cria usuário não-root (boa prática de segurança)
RUN groupadd --system app && useradd --system --gid app app

# Copia tudo do builder e remove dev deps
COPY --from=builder /app /app

RUN corepack enable \
    && chown -R app:app /app \
    && pnpm prune --prod

USER app

EXPOSE 4000

WORKDIR /app/apps/api

# Healthcheck (railway.toml/healthcheckPath)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
