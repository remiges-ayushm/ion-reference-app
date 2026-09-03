# beckn-app

A reference implementation of a buyer (BAP) and seller (BPP) application on
the Beckn protocol, plus the Beckn network adapters (onix) that sign, route,
and validate their traffic.

| Service | What it is | Local port | Source |
|---|---|---|---|
| `bap` | Buyer-side app (Go) | 8083 | `bap-application/` |
| `bpp` | Seller-side app (Go) | 8080 | `bpp-application/` |
| `bap-frontend` | Buyer web UI | 3000 | `bap-frontend/` |
| `bpp-frontend` | Seller/admin web UI | 3001 | `bpp-frontend/` |
| `onix-bap` | Beckn network adapter for bap | 8081 | `onix-bap/` |
| `onix-bpp` | Beckn network adapter for bpp | 8082 | `onix-bpp/` |

Plus Postgres and two Redis instances (Docker Compose locally; a dedicated
Cloud SQL instance and a dedicated Memorystore instance in the cloud).

## Docs map

- **Local development** (Docker Compose, fastest way to get a working
  end-to-end system) → [INFRA_SETUP.md](INFRA_SETUP.md#1-local-development-docker-compose)
- **Deploy to your own fresh GCP project** → this README, below
- **Cloud deploy reference** (every gotcha hit building this, verification,
  redeploys, inspecting Cloud SQL) → [terraform/README.md](terraform/README.md)

## Prerequisites

Before touching Terraform, make sure you have:

- A GCP project with a **billing account linked**. A brand-new project has
  none by default, and the first bootstrap step fails immediately without one.
- `gcloud` authenticated with Owner (or equivalent) on that project, plus
  Application Default Credentials configured (separate credential store from
  `gcloud auth login`):
  ```sh
  gcloud auth application-default login
  gcloud auth application-default set-quota-project <YOUR_PROJECT_ID>
  ```
- `terraform >= 1.5` and `docker` installed locally.
- **A registered Beckn network identity for both `bap` and `bpp`** — a
  subscriber ID, a `keyId`, an Ed25519 signing keypair, and an encryption
  keypair for each side, registered against the Beckn network registry you're
  deploying against. **You cannot generate these yourself** — they must
  actually be registered so other participants can verify your signatures.
  Ask whoever administers that network registry for a subscriber slot. This
  is why five Terraform variables below have no default: `terraform plan`
  will refuse to run until you supply real values.

## Deploy to your fresh GCP project

All commands below run from the repo root unless noted, and `<YOUR_PROJECT_ID>`
/ `<YOUR_REGION>` are placeholders — pick real values and use them consistently.

### 0. Point Terraform state at your project

`terraform/backend.tf` currently hardcodes a state bucket name for the
project this repo was built against. Edit it before running `terraform init`:

```hcl
# terraform/backend.tf
terraform {
  backend "gcs" {
    bucket = "<YOUR_PROJECT_ID>-tfstate"   # was: ion-sandbox-001-tfstate
    prefix = "beckn-app"
  }
}
```

### 1. Create the state bucket

Chicken-and-egg: Terraform can't create the bucket it stores its own state
in, so this is a one-time manual step.

```sh
gcloud storage buckets create gs://<YOUR_PROJECT_ID>-tfstate \
  --project=<YOUR_PROJECT_ID> --location=<YOUR_REGION> \
  --uniform-bucket-level-access
gcloud storage buckets update gs://<YOUR_PROJECT_ID>-tfstate --versioning
```

### 2. Create `terraform/terraform.tfvars`

Not committed (already git-ignored). At minimum, override `project_id` and
supply the five identity variables that have no default:

```hcl
# terraform/terraform.tfvars
project_id       = "<YOUR_PROJECT_ID>"
region           = "<YOUR_REGION>"
bap_id           = "<your registered onix-bap identity>"
bpp_id           = "<your registered onix-bpp identity>"
network_id       = "<your registry's network id>"
cds_discover_url = "<your registry's discover URL>"
```

There's no `cds_publish_url` to supply — `bpp`'s `CDS_PUBLISH_URL` points at
the `onix-catalog-publish` Cloud Run service this module deploys (a
same-project, same-operator service, not an external registry endpoint), and
Terraform computes that URL itself.

### 3. Bootstrap APIs, Artifact Registry, and empty secret containers

```sh
cd terraform
terraform init
terraform plan -target=google_project_service.apis \
  -target=google_artifact_registry_repository.repo \
  -target=google_secret_manager_secret.this -out=bootstrap1.tfplan
terraform apply bootstrap1.tfplan
```

### 4. Seed secrets

14 secrets are seeded outside Terraform (`postgres-password` is the only one
Terraform generates itself). Use values for the identity you registered in
the prerequisites — `BAP_PRIVATE_KEY`/`BAP_KEY_ID` **must** be the same
keypair/identity as `BAP_ONIX_SIGNING_PRIVATE_KEY`/`BAP_ONIX_KEY_ID` (same
rule for bpp) — there's exactly one registered identity per side:

```sh
PROJECT_ID=<YOUR_PROJECT_ID> \
  BAP_PRIVATE_KEY=... BAP_KEY_ID=... BPP_PRIVATE_KEY=... BPP_KEY_ID=... \
  BAP_ONIX_KEY_ID=... BAP_ONIX_SIGNING_PRIVATE_KEY=... BAP_ONIX_SIGNING_PUBLIC_KEY=... \
  BAP_ONIX_ENCR_PRIVATE_KEY=... BAP_ONIX_ENCR_PUBLIC_KEY=... \
  BPP_ONIX_KEY_ID=... BPP_ONIX_SIGNING_PRIVATE_KEY=... BPP_ONIX_SIGNING_PUBLIC_KEY=... \
  BPP_ONIX_ENCR_PRIVATE_KEY=... BPP_ONIX_ENCR_PUBLIC_KEY=... \
  ../scripts/seed-secrets.sh
```

### 5. Build and push all 10 images

```sh
PROJECT_ID=<YOUR_PROJECT_ID> REGION=<YOUR_REGION> ../scripts/build-and-push.sh
```

### 6. Create the network, Cloud SQL, and Redis

Cloud SQL private-IP creation is slow (budget 5–10 minutes), which is why
it's sequenced as its own targeted apply:

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

### 7. First full apply — expect it to fail on `bap`/`bpp`

The databases have no schema yet, and both apps exit if a required startup
query fails. This is normal for a first deploy:

```sh
terraform plan -out=full.tfplan
terraform apply full.tfplan
```

### 8. Run migrations

```sh
gcloud run jobs execute migrate-bap --project=<YOUR_PROJECT_ID> --region=<YOUR_REGION> --wait
gcloud run jobs execute migrate-bpp --project=<YOUR_PROJECT_ID> --region=<YOUR_REGION> --wait
```

### 9. Re-apply

```sh
terraform plan -out=full2.tfplan
terraform apply full2.tfplan
```

`bap`/`bpp` should now start successfully against the real schema.

For the full list of gotchas hit while building this deploy (secret
propagation, image pinning, subnet sizing, and more), see
[terraform/README.md](terraform/README.md#gotchas-actually-hit-doing-this-not-theoretical--each-one-broke-a-real-deploy).

## Verify the deployment

```sh
terraform output bap_frontend_url bpp_frontend_url
```

Open both URLs and confirm the SPA loads. Then seed some demo catalog data
via [catalog-seed/](catalog-seed/) against the new `bpp_url` and try a
discover flow end-to-end.

## Custom domain for DeDi discovery files (optional)

`onix-catalog-publish` writes signed catalog files (`index/becknCatalogs.index.json`,
`catalogs/*.json.gz`) to `outputRoot` on every "Publish to Network" click.
`terraform/gcs-dedi-static.tf` and `terraform/cloud-run-dedi-static.tf` back
that `outputRoot` with a public GCS bucket and a small nginx service
(`dedi-static-server`), and `terraform/domain-mapping.tf` maps it onto a
custom domain (`var.dedi_domain`/`var.dedi_domain_www`) so the discovery
chain — `.well-known/dedi.index.json` → `dedi/ion-scratch-registry.json` →
`index/becknCatalogs.index.json` → the catalog files themselves — is
publicly reachable. The *feature* is optional (the rest of the deployment
works without it, though `onix-catalog-publish`'s output has nowhere durable
to go if you skip it) — but the underlying Terraform **resources are not
conditional**, there's no flag to skip creating them. That means:

**`dedi_domain`/`dedi_domain_www` have no default** — same treatment as
`bap_id`/`bpp_id`/`network_id`/`cds_discover_url` above, and for the same
reason: a hardcoded default pointing at *some* domain is exactly how you'd
end up silently deploying against a domain you don't control. `terraform
plan` fails immediately and loudly ("no value for required variable") until
you set both in `terraform.tfvars` to a domain you actually own and can
verify — before that, there's no `apply`-time surprise to plan around, this
is caught at `plan` time.

**Prerequisite:** the domain must be a **verified domain** in
[Search Console](https://search.google.com/search-console) under the same
Google account your `gcloud`/Terraform credentials use —
`google_cloud_run_domain_mapping` fails until that's done.

**Deploy sequence:**

1. Set `dedi_domain`/`dedi_domain_www` in `terraform.tfvars` — required,
   `terraform plan` fails without them.
2. Build and push the `dedi-static-server` image — it's included in step 5
   above if you're deploying fresh. If you're adding this to an
   **already-running** deployment, build and push it explicitly before
   applying, since there's no "build all images" checkpoint to fall back on
   at that point:
   ```sh
   gcloud auth configure-docker <YOUR_REGION>-docker.pkg.dev --quiet
   docker build -t <YOUR_REGION>-docker.pkg.dev/<YOUR_PROJECT_ID>/beckn-app/dedi-static-server:latest dedi-static-server/
   docker push <YOUR_REGION>-docker.pkg.dev/<YOUR_PROJECT_ID>/beckn-app/dedi-static-server:latest
   ```
3. `terraform plan -out=dedi.tfplan && terraform apply dedi.tfplan`. If
   `google_cloud_run_domain_mapping` fails with a region/availability error,
   see the comment at the top of `terraform/domain-mapping.tf` — Cloud Run
   domain mapping has historically had self-service limited to a subset of
   regions.
4. Get the DNS records and create them at your registrar (the one step I
   can't automate):
   ```sh
   terraform output dedi_domain_dns_records
   terraform output dedi_domain_www_dns_records
   ```
5. Upload the two files that rarely change and aren't generated by anything
   in this repo. Put `dedi.index.json` and `ion-scratch-registry.json` in
   `dedi-onboarding-files/` (see `dedi-onboarding-files/.env.local.example`
   for the signing keys), then re-sign and upload them:
   ```sh
   task sign-dedi-files
   task deploy-dedi-files
   ```
6. Wait for the managed SSL cert (up to ~60 min after DNS propagates), then
   `curl https://<your domain>/.well-known/dedi.index.json`.

## Routing BPP/BAP receiver calls through the custom domain (optional)

Builds on the section above — requires the custom domain already mapped to
`dedi-static-server`. `dedi-static-server`'s nginx also reverse-proxies
`/bpp/receiver/*` → `onix-bpp` and `/bap/receiver/*` → `onix-bap`, so a
subscriber's registered URL can be `https://<your domain>/bpp/receiver/` (or
`/bap/receiver/`) instead of `onix-bpp`'s/`onix-bap`'s raw `*.run.app` URL.

This also sidesteps the path mismatch in
[terraform/README.md's Gotcha #7](terraform/README.md#gotchas-actually-hit-doing-this-not-theoretical--each-one-broke-a-real-deploy):
other participants append `/<action>` directly to whatever URL is
registered, and `onix`'s receiver modules default to listening at
`/bpp/receiver/`/`/bap/receiver/` — baking that same suffix into the
*registered* URL itself makes `<registered-url>/<action>` land correctly,
without needing to change either receiver module's own listening path.

**How it's wired:**
- `dedi-static-server/nginx.conf.template` — the two `location` blocks doing
  the proxying, targeting `${ONIX_BPP_HOST}`/`${ONIX_BAP_HOST}`.
- `dedi-static-server/Dockerfile` — `COPY`s that template into
  `/etc/nginx/templates/default.conf.template` rather than directly into
  `/etc/nginx/conf.d/`, so `nginx:alpine`'s built-in entrypoint does the
  `envsubst` substitution from real environment variables at container
  startup. This has to happen at *startup*, not image build time, because
  the target host is only known once `onix-bpp`/`onix-bap` already exist.
- `terraform/cloud-run-dedi-static.tf` — sets `ONIX_BPP_HOST`/`ONIX_BAP_HOST`
  on the container from `google_cloud_run_v2_service.onix_bpp.uri` /
  `google_cloud_run_v2_service.onix_bap.uri` (scheme stripped).
- Redeploying after touching any of the above is the same as any other
  Cloud Run image change — see "Redeploy after a change" → "Code change in
  any service" below.

**Do not extend this to `/bpp/caller/` or `/bap/caller/`.** Unlike the
receiver modules (`validateSign` is their first processing step), the caller
modules have no inbound signature validation — they trust whoever calls them
and sign+forward outbound messages on the participant's behalf. They're
meant to stay reachable only internally: `BPP_CALLER_URL`/`ADAPTER_URL`
point directly at `onix-bpp`'s/`onix-bap`'s raw Cloud Run URL, set by
`terraform/cloud-run-wiring.tf`. Proxying either publicly would let anyone
get that adapter to sign and send forged outbound messages impersonating
this participant.

**Update:** `BAP_URI`/`BPP_URI` (the in-band `context.bapUri`/`context.bppUri`
fields on outbound messages) now *do* point at this same domain+path —
`terraform/cloud-run-wiring.tf` sets them to `https://${var.dedi_domain}/bap/receiver/`
/ `.../bpp/receiver/`. This is required, not just cosmetic: other network
participants POST callbacks to `{bapUri}/<action>` directly, and
`bapTxnReceiver`/`bppTxnReceiver` only listen at `/bap/receiver/`/
`/bpp/receiver/` (see `config/local-simple-bap.yaml`/`local-simple-bpp.yaml`)
— a bare `bapUri` with no path would misroute every inbound callback.

## Custom domains for bap, bap-frontend, bpp-frontend, and the landing page (optional)

`terraform/domain-mapping.tf` also maps `bap` (`var.bap_domain`),
`bap-frontend` (`var.bap_frontend_domain`), `bpp-frontend`
(`var.bpp_frontend_domain`), and `landing-page` (`var.landing_page_domain`) to
their own subdomains — same `google_cloud_run_domain_mapping` pattern,
Search Console verification prerequisite, and **no-default treatment** as
`dedi_domain` above: all four are required, `terraform plan` fails without
them. Set all four in `terraform.tfvars` to subdomains you control before
applying.

`bpp` intentionally does **not** get its own separate domain — it shares
`dedi-static-server`'s domain instead, via one more `location` block in
`dedi-static-server/nginx.conf.template` (`/api/v1/` → `bpp`'s dashboard/
provider-facing API, using the same envsubst'd-hostname proxy pattern as the
`/bpp/receiver/`/`/bap/receiver/` blocks above). `bpp`'s other route group,
`/api/webhook/*`, is reached internally by `onix-bpp` via `bpp`'s raw Cloud
Run URL (`BPP_URL`, set by `cloud-run-wiring.tf`) and is deliberately not
exposed on any public domain.

After applying, get the DNS records for the four new domains the same way as
`dedi_domain`:
```sh
terraform output bap_domain_dns_records
terraform output bap_frontend_domain_dns_records
terraform output bpp_frontend_domain_dns_records
terraform output landing_page_domain_dns_records
```

## Redeploy after a change

### A new service added to the Terraform module

If you add a brand-new `google_cloud_run_v2_service` to an
**already-running** deployment (not a fresh deploy — see step 5 above,
which already covers this case), Cloud Run refuses to create the service
until its image exists in Artifact Registry: `Image '...' not found`. Build
and push that one image before applying:
```sh
docker build -t <YOUR_REGION>-docker.pkg.dev/<YOUR_PROJECT_ID>/beckn-app/<new-service>:latest <new-service-dir>/
docker push <YOUR_REGION>-docker.pkg.dev/<YOUR_PROJECT_ID>/beckn-app/<new-service>:latest
```
then `terraform apply` as usual.

### Code change in any service

Cloud Run pins each service to a specific image digest at deploy time, and
every Cloud Run resource in this module has a `lifecycle { ignore_changes =
[...] }` block on its image — so pushing a new image under the same
`:latest` tag does nothing to an already-running service. Pushing under a
new tag and passing that tag to `terraform apply` is what forces a redeploy:

```sh
PROJECT_ID=<YOUR_PROJECT_ID> REGION=<YOUR_REGION> ./scripts/build-and-push.sh "$(git rev-parse --short HEAD)"
cd terraform
terraform apply -var="image_tag=$(git rev-parse --short HEAD)"
```

### Database migration added

The migrate *jobs* have the same `ignore_changes` lifecycle, so the
`image_tag` apply above won't touch them — update and re-run each job
explicitly:

```sh
gcloud run jobs update migrate-bap --project=<YOUR_PROJECT_ID> --region=<YOUR_REGION> \
  --image="<YOUR_REGION>-docker.pkg.dev/<YOUR_PROJECT_ID>/beckn-app/bap-application-migrate:$(git rev-parse --short HEAD)"
gcloud run jobs execute migrate-bap --project=<YOUR_PROJECT_ID> --region=<YOUR_REGION> --wait

gcloud run jobs update migrate-bpp --project=<YOUR_PROJECT_ID> --region=<YOUR_REGION> \
  --image="<YOUR_REGION>-docker.pkg.dev/<YOUR_PROJECT_ID>/beckn-app/bpp-application-migrate:$(git rev-parse --short HEAD)"
gcloud run jobs execute migrate-bpp --project=<YOUR_PROJECT_ID> --region=<YOUR_REGION> --wait
```

### Terraform-only change (no new image)

Just re-run Terraform — no `image_tag` needed:

```sh
cd terraform
terraform plan -out=redeploy.tfplan
terraform apply redeploy.tfplan
```

### A secret value changed (key rotation, etc.)

Reseed via `scripts/seed-secrets.sh`, then force a new revision on whatever
service reads that secret — Secret Manager's `latest` doesn't propagate to
an already-running instance. See
[terraform/README.md's Gotcha #9](terraform/README.md#gotchas-actually-hit-doing-this-not-theoretical--each-one-broke-a-real-deploy).

## Keeping local and cloud in sync

If you rotate keys or re-register an identity, the same values need updating
in local dev's `.env`/`config/local-simple-*.yaml` and the cloud secrets
above, or the two environments will drift — see
[INFRA_SETUP.md §3](INFRA_SETUP.md#3-keeping-local-and-cloud-in-sync) for the
full mapping.
