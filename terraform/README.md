# GCP deployment (Cloud Run, scale-to-zero)

Deploys beckn-app's six services (bap, bpp, bap-frontend, bpp-frontend,
onix-bap, onix-bpp) to Cloud Run in a single GCP project (`ion-sandbox-001`
by default), along with a dedicated Cloud SQL Postgres instance and a
dedicated Memorystore Redis instance created inside that same project.
Everything lives in one project — no Shared VPC, no cross-project reuse.

The onix-bap/onix-bpp Cloud Run services are named `beckn-onix-bap`/
`beckn-onix-bpp` (not the bare `onix-bap`/`onix-bpp`) — a prefix added
specifically to avoid colliding with unrelated pre-existing services that
happened to already exist under those exact names in one project this was
deployed to. If you're deploying into a genuinely fresh project you could
safely rename them back, but there's no need to — the prefix is harmless.

This directory replaces `docker-compose.yml`'s Docker-network hostnames
(`http://bap:8083`, `redis-bap:6379`, ...) with Cloud Run's per-service HTTPS
URLs and the new instances' addresses.

## Architecture notes

- **Single project, owned resources**: `network.tf` creates a VPC + subnet,
  `sql.tf` creates a new Cloud SQL Postgres instance, `redis.tf` creates a
  new Memorystore Redis instance — all in `var.project_id`. Cloud Run reaches
  both via Direct VPC Egress into the owned subnet.
- **Private Services Access for Cloud SQL**: Cloud SQL's private IP requires
  a reserved peering range (`google_compute_global_address` with
  `purpose = "VPC_PEERING"`) and a `google_service_networking_connection`
  peering the VPC with `servicenetworking.googleapis.com`, created before the
  instance itself. See `network.tf`.
- **Redis via Direct Peering**: Memorystore uses its own peering mechanism
  (`connect_mode = "DIRECT_PEERING"`, a separate reserved CIDR from the PSA
  range) — simpler than Cloud SQL's setup, no `google_service_networking_connection`
  needed for it. See `redis.tf`.
- **Dedicated Redis, no cross-tenant risk**: unlike a shared/reused instance,
  this Redis is created solely for this deployment — no risk of another
  tenant's cached routing decision colliding with this app's.
- **Custom onix images**: `onix-bap/` and `onix-bpp/` wrap the vendor's
  `fidedocker/onix-adapter` image with an `entrypoint.sh` that runs
  `envsubst` over `.yaml.tmpl` templates (the real `keyManager`/`router`/
  `schemaValidator` config) at container startup, substituting only the
  small set of env vars Cloud Run actually varies at runtime (Redis address,
  cross-service URLs, signing keys). Everything else is baked into the image
  at build time.
- **Cloud SQL Auth Proxy sidecar**: bap/bpp/the migrate jobs reach Postgres
  via a `cloudsql-proxy` sidecar container on `127.0.0.1:5432`, not the
  native `/cloudsql` socket — zero app-code changes needed (`DB_HOST` is
  just `127.0.0.1`).
- **Circular URL dependencies**: bap↔onix-bap and bpp↔onix-bpp each
  reference the other's Cloud Run URL. Terraform can't express a cycle, so
  those specific env vars are set to a bootstrap placeholder in the initial
  resource declarations and patched to the real value by
  `cloud-run-wiring.tf` (a `null_resource` + `gcloud run services update`)
  once every service's URL is known. This step re-runs on every
  `terraform apply` (deliberately — see Gotchas).
- **Public access**: all six services plus `onix-catalog-publish` grant
  `roles/run.invoker` to `allUsers` — no auth. Documented tradeoff, not an
  oversight; see `iam-invoker.tf`.
- **Network identity**: `BAP_ID`/`BPP_ID` (context.bapId/bppId in every
  outbound message) and the onix keyManager's `NETWORK_PARTICIPANT` share
  the *same* Terraform variable (`var.bap_id`/`var.bpp_id` — see
  `variables.tf`). These two uses must always be the same value, and
  `BAP_PRIVATE_KEY`/`BAP_KEY_ID` (the app's own key for signing direct CDS
  calls) must also be the *same keypair* as the onix keyManager's signing
  key — there is only one registered identity per side, not two. See the
  first Gotcha below for what happens if this drifts. This deployment uses
  its own separate registered identity (not the same one as local dev or any
  other deployment) — `bap_id`/`bpp_id`/etc. have no default in
  `variables.tf` on purpose, so `terraform plan` fails loudly until
  `terraform.tfvars` supplies real values.

## Prerequisites

- `gcloud` CLI, authenticated, with Owner (or equivalent) on the target
  project.
- **A billing account linked to the project.** A brand-new project has none
  by default — `google_project_service.apis` fails immediately without one.
- Application Default Credentials set up: `gcloud auth application-default
  login` and `gcloud auth application-default set-quota-project
  <PROJECT_ID>` (separate from `gcloud auth login` — Terraform's provider
  reads a different credential store).
- `terraform` >= 1.5, `docker`.
- The wiring step shells out to `gcloud run services update` during
  `terraform apply` — make sure `gcloud` is authenticated against the target
  project on the machine running `terraform apply`.

## Bootstrap sequence

See [README.md](../README.md#deploy-to-your-fresh-gcp-project) for the full
fresh-deploy walkthrough (Task commands, step by step). Its steps 1-9
correspond 1:1 to the step numbers the Gotchas below reference — this file
doesn't repeat that content, only what's distinct to it: architecture notes,
the gotchas actually hit building this, verification, redeploying, and
inspecting Cloud SQL.

## Gotchas actually hit doing this (not theoretical — each one broke a real deploy)

1. **`BAP_ID`/`NETWORK_PARTICIPANT`/`BAP_KEY_ID` must all agree.** onix signs
   a message using the keyset registered for whatever `subscriber_id` the
   message *itself* claims to be from (`context.bapId`), not just whatever
   identity the onix pod happens to be configured as. If `BAP_ID` says one
   subscriber but the onix keyManager only has keys for a different one:
   `"Keyset not found for keyID: ..."` → 500. Same rule applies to
   `BAP_PRIVATE_KEY`/`BAP_KEY_ID` (used for direct-to-CDS signing, bypassing
   onix) — the CDS itself will reject with `"subscriber identity mismatch"`
   if that keypair's embedded subscriber doesn't match `context.bapId`
   either. There is exactly one registered identity per side; every signing
   path must use it. Especially easy to hit here since this deployment's
   identity is deliberately separate from local dev's — don't let any value
   fall back to the wrong identity.
2. **`sqladmin.googleapis.com` must be enabled on the project.** The Cloud
   SQL Auth Proxy sidecar calls the Cloud SQL Admin API using this project's
   own service account/quota context. Symptom: `cloudsql-proxy` container
   fails with `"Cloud SQL Admin API has not been used in project <number>
   before or it is disabled."`
3. **`tern.conf` renders as a Go template — literal values are never read
   from the environment.** `jackc/tern` parses `tern.conf` through
   `text/template` with Masterminds/sprig functions. A plain
   `host = localhost` line is never substituted; it takes `{{env "PGHOST" |
   default "localhost"}}` syntax to actually pick up `PGHOST` at runtime.
   Without this, the migrate job silently connects to whatever
   host/port/user/db is hardcoded in the file, not the Cloud SQL Auth Proxy
   sidecar — and fails with a plain connection-refused error that doesn't
   obviously point at the real cause.
4. **`gcloud run services update`/`jobs update`'s container-scoped flags
   (`--update-env-vars`, `--image`, etc.) need an explicit `--container=NAME`
   once a service/job has more than one container** (e.g. the
   `cloudsql-proxy` sidecar). Omitting it is either ambiguous or targets the
   wrong container depending on gcloud version.
5. **Cloud Run rejects `memory < 512Mi` when CPU is "always allocated"**
   (the default). The frontend nginx containers hit this at 256Mi even
   though nginx barely needs it — bumped to 512Mi.
6. **First `terraform apply` will fail on `bap`/`bpp` even with everything
   else correct**, because the databases have no schema yet and both apps
   `os.Exit(1)` if a required startup query fails against a table that
   doesn't exist. The migrate jobs (Cloud Run *jobs*, not services) get
   created fine in that same apply since jobs don't block on a health
   check — run them, then re-apply. This is why README.md's fresh-deploy
   sequence has an apply → migrate → apply-again shape instead of one apply.
7. **Resolved: the registered Subscriber URL and the onix module's
   listening path must agree.** Used to be a problem: if a participant's
   registry entry were a bare URL (e.g. `https://onix-bpp-xxx.a.run.app`, no
   path), other participants doing a registry-based lookup would call
   `<that-bare-url>/<action-name>` directly — e.g. `.../select` — not
   `<url>/bpp/receiver/select`, 404ing against the onix adapter's actual
   receiver path. Now fixed on both fronts that mattered: `context.bapUri`/
   `bppUri` on our own outbound messages already include the receiver path
   (`cloud-run-wiring.tf`, confirmed working via a real `/select` →
   `/on_select` transaction), and the actual registered entry in
   `dedi-onboarding-files/ion-scratch-registry.json` already has the path
   baked in (`"url": "https://.../bpp/receiver/"`), not a bare URL.
8. **Cloud Run pins an image tag to a specific digest at deploy time and
   never re-resolves it.** Pushing a new image under the same `:latest` tag
   does nothing to an already-running service/job — `lifecycle {
   ignore_changes = [...] }` on every Cloud Run resource means Terraform
   won't touch it either. Force it with `gcloud run services update
   --container=<name> --image=<new-ref>` (services) or `gcloud run jobs
   update --container=<name> --image=<new-ref>` (jobs).
9. **Secret Manager's `version = "latest"` doesn't propagate to already-running
   instances.** Adding a new secret version doesn't do anything until a
   *new revision* starts (secrets are resolved at container start, not
   live). Any change to a secret value needs a forced redeploy of whatever
   service/job reads it — a `terraform apply` that touches an unrelated
   field on that resource is enough, since it creates a new revision.
10. **Cloud SQL private-IP instance creation is slow.** Budget 5-10 minutes
    for README.md's step 6 — it's sequenced as its own targeted apply rather than
    bundled into the full apply, so a failure there is cheap to retry
    without churning any Cloud Run resource.
11. **Subnet CIDR, the PSA reserved range, and Redis's reserved IP range must
    not overlap.** The defaults in `variables.tf` (`10.10.0.0/24` for the
    subnet, an auto-selected `/20` for PSA, `10.20.0.0/29` for Redis) don't
    overlap each other — if you customize any of them, check for overlap
    before applying.
12. **`roles/compute.networkUser` for Direct VPC Egress is granted to the
    Cloud Run Service Agent, not the runtime SA, as a precaution.** Google's
    docs tie this requirement specifically to Shared VPC; in a single
    project it may not be strictly necessary. Kept anyway since it's a
    harmless, idempotent grant — worth checking empirically on first apply
    whether it can be removed.
13. **Adding a new `google_cloud_run_v2_service` to an already-running
    deployment fails with `Image '...' not found`** unless its image was
    built and pushed first. On a fresh deploy this never bites, since
    README.md's step 5 builds every image before the first full apply — it only shows up
    when a new service is added later, one at a time, with no "build all
    images" checkpoint to fall back on. Build and push that one image
    (`docker build`/`docker push` directly, or a full `build-and-push.sh`
    run) before applying it. Hit this adding `onix-catalog-publish` and
    `dedi-static-server`.

## Verification

- `terraform output bap_frontend_url bpp_frontend_url` — open both, confirm the SPA loads.
- `gcloud run jobs executions list --job=migrate-bap --project=ion-sandbox-001` — confirm `Succeeded` (same for migrate-bpp).
- Repeat the discover → select flow against the new `bap_url`, watching
  `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="bap"' --project=ion-sandbox-001 --freshness=5m`
  (swap the service name for `beckn-onix-bap`/`bpp`/`beckn-onix-bpp` as needed) for
  signing errors or connectivity failures.
- A cloudsql-proxy sidecar failing its startup probe means the
  `roles/cloudsql.client` grant isn't working; onix logs timing out reaching
  Redis means the `compute.networkUser` subnet grant isn't working, or the
  Redis instance isn't in `READY` state yet.
- Seed a catalog via `catalog-seed/` against the new `bpp_url`.

## Redeploying after a code change

```sh
task redeploy:<service>   # e.g. task redeploy:bap-frontend — only that one service
task redeploy:all         # every service, not the migrate jobs
```
(The `lifecycle { ignore_changes = [...] }` block on each Cloud Run resource
means **neither** a plain `terraform apply` **nor** one with a new
`image_tag` var redeploys a new image — `ignore_changes` blocks that field
regardless of where the new value comes from. `redeploy:<service>` sidesteps
this entirely by calling `gcloud run services update --image=...` directly,
same as every redeploy in this repo's own history actually uses. For the two
migrate jobs specifically, use `task redeploy:migrate-bap`/`migrate-bpp` —
see Gotcha #8.)

## Inspecting the Cloud SQL instance

It has no public IP and isn't reachable by `cloud-sql-proxy` run outside a
VPC-attached environment (your laptop won't reach the private IP even with
`--private-ip` — only Cloud Run's Direct VPC Egress can). Use **Cloud SQL
Studio** in the console instead — no network path needed, goes through the
Cloud SQL Admin API:
```
https://console.cloud.google.com/sql/instances/beckn-app-postgres/studio?project=ion-sandbox-001
```
Log in inside Studio with the `trade` user and the `postgres-password`
secret's value (`gcloud secrets versions access latest --secret=postgres-password --project=ion-sandbox-001`).
