# syntax=docker/dockerfile:1
#
# Multi-stage build for the React/Vite SPA (CLAUDE.md §30).
#
# Same monorepo reasoning as apps/api/Dockerfile: build context is the repo
# root, all three workspace package.json files are copied so `npm ci` sees
# the exact workspace set the lockfile was generated against, but only
# packages/shared and apps/web source are actually compiled here.

FROM node:22-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
# npm runs every workspace member's lifecycle scripts on a root install, not
# just the one being built: `packages/shared`'s `prepare` runs `tsc -b`
# (needs its full source + tsconfig) and `apps/api`'s `postinstall` runs
# `prisma generate` (needs schema.prisma) — both copied ahead of `npm ci`
# so this web-only build doesn't fail on api's install step.
COPY packages/shared packages/shared
COPY apps/api/prisma apps/api/prisma
RUN npm ci

COPY apps/web apps/web

RUN npm run build -w @haushaltsauktion/shared
# Vite's production mode (set by `vite build`) is what keeps LoginPage's
# `import.meta.env.DEV`-gated demo-login row out of this bundle — see the
# campaign decision log: "a demo login that survives into production is a
# credential bypass." `VITE_DEMO_LOGIN` is the one deliberate escape hatch
# (LoginPage.tsx: `showDemo = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN
# === 'true'`) — it defaults to unset/false here, so a normal build (and the
# real deploy in .github/workflows/deploy.yml's build-and-push job) is
# unaffected. Only the throwaway E2E stack sets it, via
# `deploy/docker-compose.e2e.yml`'s build arg, because the E2E suite drives
# login through that same quick-select row and the suite must run against
# the actual built image, not the dev server.
ARG VITE_DEMO_LOGIN=false
ENV VITE_DEMO_LOGIN=$VITE_DEMO_LOGIN
# Bugfix "reliable-update-check-forced-reload-overlay": Vite bakes this into
# the built JS at compile time (must be a `VITE_`-prefixed name to be
# exposed via `import.meta.env`), so it has to be set here in the build
# stage, unlike the API's runtime-stage `APP_VERSION`. deploy.yml's
# build-and-push job passes the same short Git SHA it tags the image with;
# defaults to `dev` for a plain local build.
ARG VITE_APP_VERSION=dev
ENV VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build -w @haushaltsauktion/web

FROM nginx:1.27-alpine AS runtime
# The official nginx:alpine image ships neither wget nor curl — installed
# explicitly so deploy/docker-compose.prod.yml's healthcheck has something
# to run against http://localhost/ instead of relying on whatever happens
# to be in the base image (found the hard way: the first healthcheck
# attempt used wget, which isn't present here, and reported permanently
# unhealthy despite nginx itself running fine).
RUN apk add --no-cache curl
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
