# syntax=docker/dockerfile:1
#
# Multi-stage build for the Fastify API (Architektur §7.1, CLAUDE.md §30).
#
# Build context is the repo root (docker-compose.yml sets `context: .`)
# because this is an npm-workspaces monorepo: apps/api depends on
# packages/shared through a workspace reference, not a published package.
# All three workspace package.json files are copied (not just api+shared)
# so `npm ci` sees the exact workspace set the lockfile was generated
# against — apps/web's *source* is never copied into this image, only its
# package.json, since this build never needs to compile it.

FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# `apps/api`'s postinstall runs `prisma generate` (needs schema.prisma) and
# `packages/shared`'s own `prepare` script runs `tsc -b` (needs its full
# source, not just package.json) — both fire during `npm ci` because npm
# runs every workspace member's lifecycle scripts on a root install, not
# just the one being built. So both are copied ahead of `npm ci`, trading
# some layer-cache granularity for a build that isn't order-dependent on
# npm internals.
COPY apps/api/prisma apps/api/prisma
COPY packages/shared packages/shared
RUN npm ci

COPY apps/api apps/api

RUN npm run build -w @haushaltsauktion/shared
RUN npm run build -w @haushaltsauktion/api

FROM node:22-alpine AS runtime
# Bugfix "reliable-update-check-forced-reload-overlay": baked in at image
# build time (deploy.yml's build-and-push job passes the same short Git SHA
# it tags the image with as `--build-arg APP_VERSION=...`), not read from the
# instance's runtime .env — every replica of one image reports the same
# value, and it changes only on an actual redeploy. Defaults to `dev` for a
# plain `docker build`/`docker compose up` with no build-arg set.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
ENV NODE_ENV=production
WORKDIR /repo

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/api ./apps/api

WORKDIR /repo/apps/api
EXPOSE 3000

# `prisma migrate deploy` is idempotent, so running it on every container
# start is what makes "Datenbank automatisch initialisiert werden kann"
# (§42) true for `docker compose up` alone, with no separate manual step.
# Seeding is deliberately NOT run here — it's a demo/dev convenience, not
# something that should silently re-seed a real deployment on every
# restart. See README.md's "Demo-Daten" section for the one-off command.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
