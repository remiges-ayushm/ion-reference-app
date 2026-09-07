# Infra setup — from scratch

This is the master checklist for standing up beckn-app's infrastructure,
local and cloud, from a completely fresh clone. It's split into two
independent tracks:

- **[Local development](#1-local-development-docker-compose)** — everything
  runs in Docker Compose on your machine. Start here; it's the fastest way to
  get a working end-to-end system and to generate/verify the signing keys
  you'll reuse in the cloud track.
- **[Cloud deployment](#2-cloud-deployment-cloud-run)** — deploys the same
  six services to Google Cloud Run. Full detail lives in
  [`terraform/README.md`](terraform/README.md); this section is the
  condensed version plus how it fits together with the local track.

## The six services

| Service | What it is | Local port | Local dev source |
|---|---|---|---|
| `bap` | Buyer-side app (Go) | 8083 | `bap-application/` |
| `bpp` | Seller-side app (Go) | 8080 | `bpp-application/` |
| `bap-frontend` | Buyer web UI | 3000 | `bap-frontend/` |
| `bpp-frontend` | Seller/admin web UI | 3001 | `bpp-frontend/` |
| `onix-bap` | Beckn network adapter for bap | 8081 | `onix-bap/` |
| `onix-bpp` | Beckn network adapter for bpp | 8082 | `onix-bpp/` |

Plus Postgres and two Redis instances, all defined in `docker-compose.yml`
for local dev (in the cloud, these are a dedicated Cloud SQL instance and a
dedicated Memorystore instance created in the same project — see the cloud
section).

## 1. Local development (Docker Compose)

### 1a. Prerequisites

- Docker + Docker Compose.
- A registered Beckn network identity for both `bap` and `bpp` — a
  subscriber ID, a `keyId`, and an Ed25519 keypair for signing (`signingPrivateKey`/
  `signingPublicKey`) plus an encryption keypair (`encrPrivateKey`/`encrPublicKey`),
  each registered on the network registry you're testing against
  (`fabric.nfh.global` in this codebase's current setup). **You cannot
  generate these yourself and expect them to work** — they have to actually
  be registered so other participants can verify your signatures. Ask
  whoever administers the network registry for a subscriber slot.

### 1b. Config files you must create (all git-ignored, never committed)

1. **`.env`** (repo root) — copy `.env.example`, fill in your registered
   keys:
   ```
   BAP_PRIVATE_KEY=<your bap signingPrivateKey>
   BAP_KEY_ID=<bap subscriber id>|<bap keyId>|ed25519
   BPP_PRIVATE_KEY=<your bpp signingPrivateKey>
   BPP_KEY_ID=<bpp subscriber id>|<bpp keyId>|ed25519
   ```
   **Important:** `BAP_PRIVATE_KEY`/`BAP_KEY_ID` must be the *same keypair
   and subscriber identity* as whatever you put in `config/local-simple-bap.yaml`'s
   `keyManager` block below — there's only one registered identity per side,
   used for both the onix adapter's own signing and the app's direct CDS
   calls. Same rule for bpp. (See `terraform/README.md`'s Gotcha #1 if you
   want the full "why.")

2. **`config/local-simple-bap.yaml`** and **`config/local-simple-bpp.yaml`**
   — copy the `.example` versions next to them and fill in the same 5
   `keyManager` fields (`networkParticipant`, `keyId`, `signingPrivateKey`,
   `signingPublicKey`, `encrPrivateKey`, `encrPublicKey`) with your
   registered identity, **twice each** — both the receiver and caller
   modules in the file need the identical block.

3. **`docker-compose.yml`**'s `BAP_ID`/`BPP_ID` env vars — these must equal
   the same subscriber ID you used above. Edit them directly if your
   registered identity isn't already what's there.

### 1c. Bring it up

```sh
docker compose up -d --build
```

This builds and starts all 6 app services + Postgres + 2 Redis instances.
First run also needs the database schema created — migrations aren't run
automatically. Requires the `tern` CLI (`go install github.com/jackc/tern/v2@latest`);
each `tern.conf` already defaults to `docker-compose.yml`'s exposed Postgres
port (`5435`), so no extra config is needed:

```sh
cd bap-application/db/migrations && tern migrate && cd ../../..
cd bpp-application/db/migrations && tern migrate && cd ../../..
```

### 1d. Verify

```sh
curl http://localhost:8083/health   # bap
curl http://localhost:8080/health   # bpp
curl "http://localhost:3000/api/v1/discover?textSearch=coffee"   # full discover flow through the frontend proxy
```

A `200` with real catalog data back means signing, routing, and the CDS
connection are all working.

### 1e. Known local-dev gotcha

If you rebuild/recreate `bap`, `bpp`, `onix-bap`, or `onix-bpp` without also
restarting `frontend`/`bpp-frontend`, the frontends' nginx will keep talking
to the *old* container IP and you'll get `502 Bad Gateway`. Either
`docker compose up -d` the whole stack together, or explicitly
`docker compose restart frontend bpp-frontend` after rebuilding a backend.

## 2. Cloud deployment (Cloud Run)

Out of scope for this file — this file only covers local development. See
[README.md](README.md#deploy-to-your-fresh-gcp-project) for the full
fresh-deploy walkthrough (Task commands, step by step), and
[terraform/README.md](terraform/README.md) for the gotchas actually hit
building this, verification, redeploying, and inspecting Cloud SQL.

## 3. Keeping local and cloud in sync

Whenever the registered network identity or signing keys change (e.g. a new
subscriber registration, a key rotation), the same values need updating in
**four** places, or the two environments will drift and start failing with
subscriber-identity-mismatch errors:

| What | Local dev | Cloud |
|---|---|---|
| App-level signing key (`BAP_PRIVATE_KEY`/`BAP_KEY_ID`, `BPP_PRIVATE_KEY`/`BPP_KEY_ID`) | root `.env` | `bap-private-key`/`bap-key-id`/`bpp-private-key`/`bpp-key-id` secrets in Secret Manager |
| Onix keyManager identity (`networkParticipant`, `keyId`, signing/encr keys) | `config/local-simple-{bap,bpp}.yaml` | `bap-onix-*`/`bpp-onix-*` secrets in Secret Manager |
| Subscriber ID used in `context.bapId`/`bppId` | `docker-compose.yml`'s `BAP_ID`/`BPP_ID` | `terraform/terraform.tfvars`'s `bap_id`/`bpp_id` |
| Network ID | `docker-compose.yml`'s `NETWORK_ID` (+ both apps' `cmd/server/.env`) | `terraform/terraform.tfvars`'s `network_id` |

After any cloud secret update, the affected Cloud Run service needs a forced
new revision to actually pick up the change — see `terraform/README.md`'s
Gotcha #9.

Note: by default this deployment's cloud identity is a *separate* registered
participant from local dev's (see §2 above), not the same one — so "keeping
in sync" here mainly matters within the cloud track itself (e.g. after
rotating this deployment's own keys), not necessarily between local and
cloud.

## 4. Resolved: registered-URL / receiver-path mismatch

Used to be a problem: the registered Subscriber URL needs to include the
onix adapter's actual receiver path (`/bpp/receiver/`, `/bap/receiver/`), or
another participant looking it up and appending an action name directly
(`<url>/select`) would 404. Now fixed on both sides that mattered:
- `context.bapUri`/`bppUri` on our own outbound messages already include the
  receiver path (`terraform/cloud-run-wiring.tf`) — confirmed working via a
  real `/select` → `/on_select` transaction.
- The actual registered entry in
  `dedi-onboarding-files/ion-scratch-registry.json` already has the path
  baked in (`"url": "https://.../bpp/receiver/"`), not a bare URL.

See `terraform/README.md`'s Gotcha #7 for the fuller writeup.
