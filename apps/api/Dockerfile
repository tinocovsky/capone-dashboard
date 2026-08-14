FROM node:22.13-bookworm-slim AS builder
WORKDIR /app

# Instala pnpm direto (sem corepack — evita o bug da key signature rotacionada
# que pega em corepack bundled com Node 22.13.x).
RUN npm install -g pnpm@11.9.0

# Copia manifestos primeiro (cache layer eficiente)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json /app/
COPY apps/api/package.json /app/apps/api/
COPY packages/shared/package.json /app/packages/shared/

RUN pnpm install --frozen-lockfile

# Copia source e compila (shared precisa de build porque o package.json aponta
# pra ./src/index.ts direto — em prod Node nao carrega .ts sem loader)
COPY packages/shared /app/packages/shared
COPY apps/api /app/apps/api
RUN pnpm --filter @capone/shared build && pnpm --filter @capone/api build


FROM node:22.13-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN npm install -g pnpm@11.9.0

# Usuário não-root
RUN groupadd --system app && useradd --system --gid app app

COPY --from=builder /app /app

RUN chown -R app:app /app \
    && CI=true pnpm prune --prod

USER app

EXPOSE 4000

WORKDIR /app/apps/api

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
