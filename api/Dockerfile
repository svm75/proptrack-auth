# PropTrack API — multi-stage build, matching the exact pattern already established for
# wealth-ledger/TripOrganiser on the same NAS (see ~/Projects/wealth-ledger/nas-server/Dockerfile).
# PostgreSQL is external (the NAS's existing shared `myplatform` instance) — this image holds no
# data itself, connects only as the least-privilege `proptrack_app` role.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["node", "dist/src/server.js"]
