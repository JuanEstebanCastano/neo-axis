# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @neoaxis/api...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY apps/api ./apps/api
RUN pnpm --filter @neoaxis/api... build && \
    pnpm deploy --filter @neoaxis/api --prod /output

FROM base AS runtime
ENV NODE_ENV=production
# Nunca correr como root en el VPS.
USER node
COPY --from=build --chown=node:node /output /app
CMD ["node", "dist/server.js"]
