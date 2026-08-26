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
