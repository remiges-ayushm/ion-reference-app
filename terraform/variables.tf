variable "project_id" {
  description = "GCP project ID to deploy everything into (Cloud Run, Artifact Registry, Secret Manager, VPC, Cloud SQL, Redis)."
  type        = string
  default     = "ion-sandbox-001"
}

variable "region" {
  description = "GCP region for all resources."
  type        = string
  default     = "asia-southeast2"
}

variable "image_tag" {
  description = "Tag applied to all images by scripts/build-and-push.sh (e.g. a git SHA). Terraform ignores image changes after first create — see lifecycle blocks on each Cloud Run resource."
  type        = string
  default     = "latest"
}

variable "artifact_registry_repo_id" {
  description = "Artifact Registry Docker repository ID."
  type        = string
  default     = "beckn-app"
}

# --- New VPC/subnet for Direct VPC Egress (bap/bpp/onix-bap/onix-bpp/migrate jobs) ---

variable "vpc_name" {
  description = "Name of the VPC network this module creates."
  type        = string
  default     = "beckn-app-vpc"
}

variable "subnet_name" {
  description = "Name of the subnetwork this module creates (within vpc_name)."
  type        = string
  default     = "beckn-app-subnet"
}

variable "subnet_cidr" {
  description = "CIDR range for the subnetwork. Must not overlap psa_prefix_length's auto-selected range or redis_reserved_ip_range."
  type        = string
  default     = "10.10.0.0/24"
}

variable "psa_prefix_length" {
  description = "Prefix length of the IP range reserved for Private Services Access (Cloud SQL private IP peering). Google auto-selects a non-overlapping range of this size within the VPC."
  type        = number
  default     = 20
}

# --- New Cloud SQL instance ---

variable "sql_instance_name" {
  description = "Name of the Cloud SQL Postgres instance this module creates."
  type        = string
  default     = "beckn-app-postgres"
}

variable "sql_tier" {
  description = "Cloud SQL machine tier. db-f1-micro/db-g1-small are MySQL-only and rejected for Postgres — db-custom-1-3840 (1 vCPU/3.75GB) is the cheapest valid Postgres tier."
  type        = string
  default     = "db-custom-1-3840"
}

variable "sql_disk_size_gb" {
  type    = number
  default = 10
}

variable "sql_disk_type" {
  description = "PD_HDD is cheaper than PD_SSD; fine for a sandbox workload."
  type        = string
  default     = "PD_HDD"
}

variable "sql_availability_type" {
  description = "ZONAL (no HA, cheaper) or REGIONAL. Sandbox default is ZONAL."
  type        = string
  default     = "ZONAL"
}

variable "sql_backup_enabled" {
  description = "Whether automated backups are enabled. Off by default for a sandbox — flip on if you care about not losing data."
  type        = bool
  default     = false
}

# --- New Memorystore Redis instance ---

variable "redis_instance_name" {
  description = "Name of the Memorystore Redis instance this module creates."
  type        = string
  default     = "beckn-app-redis"
}

variable "redis_tier" {
  description = "BASIC (no HA/failover, cheapest) or STANDARD_HA."
  type        = string
  default     = "BASIC"
}

variable "redis_memory_size_gb" {
  type    = number
  default = 1
}

variable "redis_reserved_ip_range" {
  description = "CIDR reserved for Memorystore's direct peering. Must not overlap subnet_cidr or the PSA range."
  type        = string
  default     = "10.20.0.0/29"
}

# --- New databases/user on the new Cloud SQL instance ---

variable "db_name_bap" {
  type    = string
  default = "trade_bap"
}

variable "db_name_bpp" {
  type    = string
  default = "trade_bpp"
}

variable "db_user" {
  type    = string
  default = "trade"
}

# --- Beckn network identity ---
# Single source of truth per side: this value appears BOTH in context.bapId/
# bppId (every outbound message) AND as onix-bap/onix-bpp's own keyManager
# networkParticipant. These two uses MUST always match — onix signs a
# message using the keyset registered for whatever subscriber_id the message
# itself claims to be from, so any mismatch here fails signing with "keyset
# not found". No default on purpose: this deployment uses a separate
# registered identity from local dev / other deployments, and leaving a
# hardcoded default around is exactly how that kind of drift happens
# silently. terraform plan fails loudly until terraform.tfvars supplies a
# real value.

variable "bap_id" {
  type = string
}

variable "bpp_id" {
  type = string
}

variable "network_id" {
  type = string
}

# cds_discover_url is the external Beckn registry's discover endpoint (bap's
# outbound discover call). There is no equivalent cds_publish_url variable —
# bpp's CDS_PUBLISH_URL is computed from the onix-catalog-publish Cloud Run
# service this module deploys (see cloud-run-bpp.tf), since that's a
# same-project, same-operator service, not an external registry endpoint.
variable "cds_discover_url" {
  type = string
}

# --- Secrets ---
# No variables here on purpose. Every secret value (Postgres password aside,
# which Terraform generates itself) is created as an empty Secret Manager
# container by Terraform, then seeded once with its real value via
# scripts/seed-secrets.sh — see terraform/README.md. This keeps plaintext
# secrets out of every Terraform-visible file, including .tfvars and state.
