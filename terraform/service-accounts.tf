resource "google_service_account" "cloud_run_sa" {
  account_id   = "beckn-app-run-sa"
  project      = var.project_id
  display_name = "beckn-app Cloud Run runtime service account"
}

# Needed to construct the Cloud Run Service Agent's identity below
# (service-<PROJECT_NUMBER>@serverless-robot-prod.iam.gserviceaccount.com).
data "google_project" "this" {
  project_id = var.project_id
}

resource "google_project_iam_member" "artifact_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

resource "google_project_iam_member" "cloud_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Grants Direct VPC Egress rights scoped to just the one subnet Cloud Run
# uses.
#
# Google's Direct VPC Egress docs tie the requirement to grant this to the
# Cloud Run SERVICE AGENT (service-<PROJECT_NUMBER>@serverless-robot-prod.iam.gserviceaccount.com),
# rather than the workload runtime service account, specifically to the
# Shared VPC case. This is now a single-project VPC, so it may not be
# strictly required — kept anyway as a precaution since it's a harmless,
# idempotent grant either way. Worth checking empirically on first apply:
# if Direct VPC Egress works without it, it can be removed later.
resource "google_compute_subnetwork_iam_member" "network_user" {
  project    = var.project_id
  region     = var.region
  subnetwork = google_compute_subnetwork.subnet.name
  role       = "roles/compute.networkUser"
  member     = "serviceAccount:service-${data.google_project.this.number}@serverless-robot-prod.iam.gserviceaccount.com"

  depends_on = [google_project_service.apis]
}
