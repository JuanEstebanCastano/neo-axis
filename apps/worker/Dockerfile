# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/worker/package.json ./apps/worker/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @neoaxis/worker...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY apps/worker ./apps/worker
RUN pnpm --filter @neoaxis/worker... build && \
    pnpm deploy --filter @neoaxis/worker --prod /output

FROM base AS runtime
ENV NODE_ENV=production
# Nunca correr como root en el VPS.
USER node
COPY --from=build --chown=node:node /output /app
# CA raíz de Supabase para el TLS verify-full del DATABASE_URL. Se usa con ruta
# ABSOLUTA en el contenedor: sslrootcert=/app/certs/supabase-ca.crt
COPY --chown=node:node ops/certs/supabase-root-2021-ca.crt /app/certs/supabase-ca.crt
CMD ["node", "dist/index.js"]
