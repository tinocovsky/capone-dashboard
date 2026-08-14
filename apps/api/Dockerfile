FROM node:22.13-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json /app/
COPY apps/api/package.json /app/apps/api/
COPY packages/shared/package.json /app/packages/shared/

RUN pnpm install --frozen-lockfile

COPY packages/shared /app/packages/shared
COPY apps/api /app/apps/api
RUN pnpm --filter @capone/api build


FROM node:22.13-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN groupadd --system app && useradd --system --gid app app

COPY --from=builder /app /app

RUN corepack enable \
    && chown -R app:app /app \
    && pnpm prune --prod

USER app

EXPOSE 4000

WORKDIR /app/apps/api

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
