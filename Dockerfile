# PropTrack V2 frontend — production image, standalone (no Power Platform host).
# Multi-stage: build the static Vite bundle (PostgreSQL as the only runtime data backend),
# then serve it with Caddy's built-in file server. Matches
# ~/Projects/TripOrganiser/app/Dockerfile exactly — this container never talks to Postgres or
# the Dataverse-era generated services directly; it only calls the API container, same-origin,
# via a relative /api base URL supplied by the reverse proxy (deploy/Caddyfile).
#
# src/generated/ (Dataverse-generated models/services) and src/data/dataverse/* are NOT deleted
# from the repo (kept for historical rollback per migration.md's hard safety rules) but are dead
# code at runtime here — VITE_DATA_BACKEND=postgres is baked in below, so `src/data/index.ts`
# resolves to postgresRepositories and the Dataverse branch never executes. It is NOT tree-shaken
# out of the bundle (the backend selector is a runtime check, not a build-time constant Rollup
# can prove dead — see docs/ARCHITECTURE.md), so this is dead code present but unreachable, not a
# runtime dependency.
#
# `npm run build:nas` (not the default `npm run build`) is used below deliberately: it type-checks
# against tsconfig.app.nas.json, which excludes src/generated/ and src/data/dataverse/* entirely.
# Those files import `@microsoft/power-apps/data`, a package this project's package.json never
# declares — Power Platform's own `pac`/`power-apps` tooling resolves it at `pac code push` time,
# outside npm's dependency tree. On a truly clean checkout (this Docker build context, or the NAS)
# there is nothing to resolve it, so a full `tsc -b` genuinely fails with TS2307 in every
# src/generated/services/*.ts file — this is expected for the Dataverse build path, not a defect,
# and the correct fix is to exclude that unreachable subtree from the NAS build's type-check
# entirely (tsconfig.app.nas.json), not to install Power Platform packages into NAS production
# dependencies or patch around the error.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# Same-origin in production (Caddy serves both the frontend and /api from one origin) — a
# relative path avoids baking any NAS host/port/Tailscale name into the bundle.
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DATA_BACKEND=postgres
# The shared bearer token is a deploy-time build arg, not a secret value fixed in this file —
# supplied by docker-compose from a required env var (see deploy/docker-compose.yml).
ARG VITE_API_AUTH_TOKEN
ENV VITE_API_AUTH_TOKEN=$VITE_API_AUTH_TOKEN

RUN npm run build:nas

FROM caddy:2-alpine
COPY --from=build /app/dist /usr/share/caddy
COPY deploy/frontend.Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
