# Deploying the CipherVault sync server

Self-hosted, zero-knowledge sync server. The server never sees plaintext vault
data or the master/sync password — see `shared/syncProtocol.ts` for why. This
guide covers running it on your own VPS with Docker and automatic HTTPS.

## Prerequisites

- A VPS with Docker and the Docker Compose plugin installed.
- Ports 80 and 443 open and not used by anything else on the VPS (needed for
  Let's Encrypt's HTTP-01 challenge and for HTTPS traffic).
- A domain name pointed at the VPS. **You don't need this to test locally**
  (see the Caddyfile's no-domain fallback), but you do need it before any
  real device relies on this server, since Electron's `fetch` and mobile
  Capacitor WebViews won't trust a self-signed certificate.

## First deploy

```bash
git clone <your-fork-or-repo-url>
cd password-manager/server

# Edit Caddyfile: replace sync.example.com with your real domain once you
# have one. Until then, leave it as-is and use the IP-only steps below.

docker compose up -d --build
docker compose logs -f sync-server   # confirm "listening on http://127.0.0.1:8787"
```

Point the app's sync settings ("Свой сервер" / server URL field) at
`https://sync.yourdomain.com`.

## Testing before you have a domain

Replace the site block's address in `Caddyfile` with `:443` (plain, no
domain) and restart Caddy (`docker compose restart caddy`). This serves a
self-signed certificate over your VPS's IP — enough to confirm the container
boots and push/pull works, but clients must explicitly trust that cert, and
it should not be used for real accounts. Switch back to a domain block before
anyone else connects.

## Environment variables

| Variable   | Default          | Notes |
|------------|------------------|-------|
| `PORT`     | `8787`           | Only relevant if bypassing Caddy — normally internal to the compose network. |
| `DATA_DIR` | `/data` in Docker | Where `sync.db` (better-sqlite3, WAL mode) lives. Backed by the `sync-data` named volume — don't bind-mount over it without matching permissions for the `ciphervault` container user (uid 10001). |

No secrets need to be set as env vars — accounts and sessions are stored
hashed (`argon2` for `auth_hash`, `sha256` for session tokens), so a dump of
`sync.db` alone doesn't let anyone log in or decrypt vault blobs.

## Backing up the database

```bash
docker run --rm -v server_sync-data:/data -v "$PWD":/backup alpine \
  cp /data/sync.db /backup/sync.db.bak
```

(Volume name may differ — check `docker volume ls | grep sync-data` if the
compose project directory isn't named `server`.) Since it's SQLite in WAL
mode, prefer stopping the container first, or use `sqlite3 .backup` from
inside the container for a consistent snapshot while it's running.

## Updating

```bash
git pull
docker compose up -d --build
```

The `sync-data` volume persists across rebuilds — accounts and vault blobs
are not affected by redeploying the image.

## Known gaps (not addressed by this deployment setup)

- **No CORS headers**: if you ever serve the web build of CipherVault from a
  different origin than the sync server's domain, browsers will block the
  fetch calls. Not an issue for Electron or Capacitor (no same-origin
  enforcement), only relevant if a browser-hosted build talks to a remote
  sync server cross-origin. Add a CORS middleware in `server/src/app.ts`
  (`app.use(cors({ origin: ... }))`) if/when that scenario applies.
- **No horizontal scaling**: `better-sqlite3` is a single-file, single-process
  database. This is intentional for the current opt-in, minimal-scope sync
  server (see the Stage 1 plan) — moving to Postgres would be a contained
  change if load ever requires it, since the schema is two small tables.
- **No automated off-box backups**: the backup command above is manual. Wire
  it into a cron job or your VPS provider's snapshot feature for anything
  beyond personal use.
