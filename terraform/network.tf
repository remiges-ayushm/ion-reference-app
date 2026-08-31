# Owned VPC/subnet for Direct VPC Egress — Cloud Run needs this to reach the
# private-IP Cloud SQL instance and the Memorystore instance (which has no
# public-IP option at all). Single project, so no Shared VPC is needed.

resource "google_compute_network" "vpc" {
  name                    = var.vpc_name
  project                 = var.project_id
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = var.subnet_name
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = var.subnet_cidr

  # A region migration needs the new subnet created before the old one is
  # destroyed, not after: same name is fine since project+region+name is the
  # real uniqueness key, and the old subnet's destroy can end up stuck for a
  # long time behind orphaned Direct VPC Egress IP reservations releasing on
  # GCP's own schedule (observed, not fixable by retrying) — that shouldn't
  # block everything else in the region move from proceeding.
  lifecycle {
    create_before_destroy = true
  }
}

# Reserved IP range + peering connection required before a Cloud SQL instance
# can use a private IP in this VPC (Private Services Access).
resource "google_compute_global_address" "psa_range" {
  name          = "beckn-app-psa-range"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.psa_prefix_length
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range.name]
  depends_on              = [google_project_service.apis]
}
