# All services are publicly reachable (--allow-unauthenticated equivalent) —
# matches the reference deployment's documented demo-app pattern. IAM-based
# service-to-service auth (minting an ID token on every outbound call) would
# be more secure but requires app code changes; left as a documented
# future-hardening step, not implemented here.

locals {
  public_services = {
    bap                  = google_cloud_run_v2_service.bap.name
    bpp                  = google_cloud_run_v2_service.bpp.name
    bap_frontend         = google_cloud_run_v2_service.bap_frontend.name
    bpp_frontend         = google_cloud_run_v2_service.bpp_frontend.name
    onix_bap             = google_cloud_run_v2_service.onix_bap.name
    onix_bpp             = google_cloud_run_v2_service.onix_bpp.name
    onix_catalog_publish = google_cloud_run_v2_service.onix_catalog_publish.name
    landing_page         = google_cloud_run_v2_service.landing_page.name
  }
}

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  for_each = local.public_services
  project  = var.project_id
  location = var.region
  name     = each.value
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# dedi_static lives in a different region (asia-southeast1, hardcoded in
# cloud-run-dedi-static.tf) than var.region — it can't share the single
# `location = var.region` for_each block above, which assumes every entry is
# in the same region.
resource "google_cloud_run_v2_service_iam_member" "dedi_static_public_invoker" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.dedi_static.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
