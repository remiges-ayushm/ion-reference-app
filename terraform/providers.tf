# Single project — everything this module creates (Cloud Run, Artifact
# Registry, Secret Manager, service accounts, VPC, Cloud SQL, Redis) lives in
# var.project_id. No cross-project reuse, no aliased provider needed.
provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  # sqladmin is needed even though the Cloud SQL instance is created by this
  # same module — the Cloud SQL Auth Proxy sidecar (bap/bpp/migrate jobs)
  # calls the Cloud SQL Admin API using this project's own service
  # account/quota context to resolve the instance's connection metadata.
  # servicenetworking is needed for the Private Services Access peering
  # (see network.tf) that Cloud SQL's private IP requires. redis is needed
  # to create the Memorystore instance (see redis.tf).
  required_apis = [
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "iam.googleapis.com",
    "compute.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "redis.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each                   = toset(local.required_apis)
  project                    = var.project_id
  service                    = each.key
  disable_dependent_services = false
  disable_on_destroy         = false
}
