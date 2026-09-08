> **Superseded by `deploy/` (repo root)** — the final migration phase converted the frontend
> from a Power-Apps-hosted app to a standalone Vite build deployed on this same NAS, so the
> current deployment package is `deploy/docker-compose.yml` (frontend + api + Caddy,
> same-origin). This file is kept only as a historical record of the Step 9 API-only package,
> written when the frontend was still Power-Apps-hosted and the API needed `tailscale funnel` to
> be reachable across origins. Do not deploy from this file — use `deploy/README.md`.

# Deploying `api/` to the Synology NAS (Step 9 production cutover) — HISTORICAL, superseded

This is new infrastructure — `api/` has never been deployed anywhere before this point; every
prior step (6, 7, 8) only ran it locally via `npm start` for testing. This mirrors the existing
`wealth-ledger`/`TripOrganiser` pattern on the same NAS (Docker Compose + Caddy + Tailscale), with
one architectural difference: **PropTrack's frontend is hosted by Power Platform, not by this
NAS**, so real users' browsers reach it over the public internet, not over your Tailscale
network. That changes the reachability requirement below — read that section before deploying.

## Why this can't be fully automated from here

This session has confirmed Tailscale connectivity to `mfa-ds925.tailc096cf.ts.net` but has **no
SSH credential** for it, and TripOrganiser's own deployment log (`~/Projects/TripOrganiser/deploy/DEPLOYMENT_LOG.md`)
records that even its own deployment needed an interactive `sudo` password prompt on this NAS —
i.e. this has never been a fully unattended deployment target for any app on it. The steps below
are written for you (or for me, run alongside you in an interactive session where you supply the
SSH/sudo credential) to execute directly.

## 1. Choose: Tailscale `serve` vs `funnel`

- `tailscale serve` exposes a service only to devices on your own tailnet.
- `tailscale funnel` exposes it to the public internet (still terminating HTTPS via Tailscale's
  own certs, still requiring the shared `API_AUTH_TOKEN` bearer token for every request).

Because PropTrack's frontend is a Power Platform-hosted page, users' browsers are **not** on your
tailnet — only `funnel` makes the API reachable from a real user's session. `wealth-ledger`/
`TripOrganiser` didn't need this because their *frontends* are also NAS-hosted behind the same
tailnet-only `serve`. **This is a materially different, more consequential exposure decision than
what those two apps made — do not enable `funnel` without deciding this deliberately.** If you'd
rather not expose the API to the public internet, the alternative is hosting PropTrack's frontend
somewhere reachable over Tailscale too (a bigger architectural change, out of scope for this step
unless you choose it).

## 2. Provision secrets (do this yourself — nothing here is pre-filled)

Create `api/deploy/.env` on the NAS (not in this repo, never committed) with:

```
PGHOST=<the NAS's Postgres host, as seen from inside the Docker network — likely the Docker host's LAN IP or a Docker network alias, NOT mfa-ds925.tailc096cf.ts.net if the container can't resolve Tailscale MagicDNS>
PGPORT=5432   # or whatever the myplatform container's actual internal port is — 5433 was this session's *Tailscale-forwarded* external port, not necessarily its internal one; confirm on the NAS
PGDATABASE=myplatform
PGUSER=proptrack_app
PGPASSWORD=<the proptrack_app role's password, from this repo's .env.nas.local — never re-type it into a shell history; copy the file value directly>
API_AUTH_TOKEN=<generate fresh: `openssl rand -base64 32`>
ALLOWED_ORIGIN=<PropTrack V2's actual Power Apps runtime origin(s) — find this from the deployed app's URL in Power Platform; comma-separated if there's more than one (e.g. a maker-preview origin and a player origin)>
```

## 3. Build and run

```sh
cd api/deploy
docker compose up -d --build
docker compose logs -f api   # confirm it starts clean, then Ctrl-C
curl http://127.0.0.1:8082/health       # via Caddy, from the NAS itself
```

## 4. Expose via Tailscale

```sh
# tailnet-only (if you chose not to funnel):
tailscale serve --bg --https=443 http://127.0.0.1:8082
# OR public (if the frontend genuinely needs it — see §1):
tailscale funnel --bg --https=443 http://127.0.0.1:8082
```

Then `tailscale serve status` / `tailscale funnel status` to get the exact HTTPS URL this
produces — that URL is `VITE_API_BASE_URL` for the production frontend build.

## 5. Hand back to the migration session

Once running, give the session (or me, if working alongside you) the resulting HTTPS URL and
confirm `curl https://<that-url>/health` succeeds from **outside** your tailnet (e.g. your phone
on cellular data, not Wi-Fi) if you chose `funnel` — this is the actual reachability test that
matters, not just from the NAS or from a Tailscale-connected machine.
