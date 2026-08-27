# GCP deployment (Cloud Run, scale-to-zero)

Deploys beckn-app's six services (bap, bpp, bap-frontend, bpp-frontend,
onix-bap, onix-bpp) to Cloud Run in a single GCP project (`ion-sandbox-001`
by default), along with a dedicated Cloud SQL Postgres instance and a
dedicated Memorystore Redis instance created inside that same project.
Everything lives in one project — no Shared VPC, no cross-project reuse.

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

1. One-time state bucket (chicken-and-egg — Terraform can't create the
   bucket it stores its own state in):
   ```sh
   gcloud storage buckets create gs://ion-sandbox-001-tfstate \
     --project=ion-sandbox-001 --location=asia-southeast2 \
     --uniform-bucket-level-access
   gcloud storage buckets update gs://ion-sandbox-001-tfstate --versioning
   ```

2. Create `terraform/terraform.tfvars` (not committed) with your project ID
   and network identity (no defaults exist for the identity vars — see
   Architecture notes above):
   ```hcl
   project_id       = "ion-sandbox-001"
   bap_id           = "<your new onix-bap identity>"
   bpp_id           = "<your new onix-bpp identity>"
   network_id       = "<your registry's network id>"
   cds_discover_url = "<your registry's discover URL>"
   ```
   No `cds_publish_url` here — `bpp`'s `CDS_PUBLISH_URL` is computed from the
   `onix-catalog-publish` Cloud Run service this module deploys (a
   same-project, same-operator service, not an external registry endpoint).
   It reuses onix-bpp's `bpp-onix-*` secrets — nothing new to seed for it.

3. Bootstrap the things later steps depend on:
   ```sh
   cd terraform
   terraform init
   terraform plan -target=google_project_service.apis \
     -target=google_artifact_registry_repository.repo \
     -target=google_secret_manager_secret.this -out=bootstrap1.tfplan
   terraform apply bootstrap1.tfplan
   ```

4. Seed the 14 externally-provided secrets (everything except
   `postgres-password`, which Terraform generates itself) — values for this
   deployment's own separate registered identity:
   ```sh
   PROJECT_ID=ion-sandbox-001 \
     BAP_PRIVATE_KEY=... BAP_KEY_ID=... BPP_PRIVATE_KEY=... BPP_KEY_ID=... \
     BAP_ONIX_KEY_ID=... BAP_ONIX_SIGNING_PRIVATE_KEY=... BAP_ONIX_SIGNING_PUBLIC_KEY=... \
     BAP_ONIX_ENCR_PRIVATE_KEY=... BAP_ONIX_ENCR_PUBLIC_KEY=... \
     BPP_ONIX_KEY_ID=... BPP_ONIX_SIGNING_PRIVATE_KEY=... BPP_ONIX_SIGNING_PUBLIC_KEY=... \
     BPP_ONIX_ENCR_PRIVATE_KEY=... BPP_ONIX_ENCR_PUBLIC_KEY=... \
     ../scripts/seed-secrets.sh
   ```
   `BAP_PRIVATE_KEY`/`BAP_KEY_ID` MUST be the same keypair/identity as
   `BAP_ONIX_SIGNING_PRIVATE_KEY`/`BAP_ONIX_KEY_ID` — see the network identity
   note above.

5. Build and push all 10 images:
   ```sh
   PROJECT_ID=ion-sandbox-001 REGION=asia-southeast2 ../scripts/build-and-push.sh
   ```

6. Create the VPC/subnet, Private Services Access peering, Cloud SQL
   instance, and Redis instance (must exist before any `vpc_access` block
   validates). Cloud SQL instance creation is slow — budget 5-10 minutes:
   ```sh
   terraform plan -target=google_compute_network.vpc \
     -target=google_compute_subnetwork.subnet \
     -target=google_compute_global_address.psa_range \
     -target=google_service_networking_connection.psa \
     -target=google_sql_database_instance.postgres \
     -target=google_redis_instance.redis \
     -target=google_compute_subnetwork_iam_member.network_user \
     -target=google_project_iam_member.cloud_sql_client -out=bootstrap2.tfplan
   terraform apply bootstrap2.tfplan
   ```

7. First full apply — **this will fail on `bap`/`bpp` the first time**, see
   Gotchas below for why. That's expected:
   ```sh
   terraform plan -out=full.tfplan
   terraform apply full.tfplan
   ```

8. Run migrations (the databases are empty until this runs — `bap`/`bpp`
   crash-loop on startup without it):
   ```sh
   gcloud run jobs execute migrate-bap --project=ion-sandbox-001 --region=asia-southeast2 --wait
   gcloud run jobs execute migrate-bpp --project=ion-sandbox-001 --region=asia-southeast2 --wait
   ```

9. Re-apply — this time `bap`/`bpp` start successfully against the now-real schema:
   ```sh
   terraform plan -out=full2.tfplan
   terraform apply full2.tfplan
   ```

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
   check — run them, then re-apply. This is why the bootstrap sequence
   above has an apply → migrate → apply-again shape instead of one apply.
7. **The registered Subscriber URL and the onix module's listening path
   must agree.** If a participant's registry entry is a bare URL (e.g.
   `https://onix-bpp-xxx.a.run.app`, no path), other participants doing a
   registry-based lookup will call `<that-bare-url>/<action-name>` directly
   — e.g. `.../select` — not `<url>/bpp/receiver/select`. If your onix
   adapter's receiver module is only configured to listen at `/bpp/receiver/`
   (the vendor's default), that request 404s. This is a known, currently
   **unresolved** issue — the real fix is either moving the receiver module
   to listen at `/`, or re-registering with the `/receiver` suffix in the
   URL, and hasn't been decided yet.
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
    for step 6 above — it's sequenced as its own targeted apply rather than
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
    built and pushed first. On a fresh deploy this never bites, since step 5
    above builds every image before the first full apply — it only shows up
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
  (swap the service name for `onix-bap`/`bpp`/`onix-bpp` as needed) for
  signing errors or connectivity failures.
- A cloudsql-proxy sidecar failing its startup probe means the
  `roles/cloudsql.client` grant isn't working; onix logs timing out reaching
  Redis means the `compute.networkUser` subnet grant isn't working, or the
  Redis instance isn't in `READY` state yet.
- Seed a catalog via `catalog-seed/` against the new `bpp_url`.

## Redeploying after a code change

```sh
PROJECT_ID=ion-sandbox-001 REGION=asia-southeast2 ../scripts/build-and-push.sh "$(git rev-parse --short HEAD)"
terraform apply -var="image_tag=$(git rev-parse --short HEAD)"
```
(The `lifecycle { ignore_changes = [...] }` block on each Cloud Run resource
means a plain `terraform apply` with no tag change won't redeploy a new
image — you must pass a new `image_tag`. For the two migrate jobs
specifically, this doesn't apply the new image either — see Gotcha #8.)

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
