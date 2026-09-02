# Static entry-point page with buttons to bap-frontend and bpp-frontend.
# Plain nginx, no DB, no volume mount — button URLs come from BAP_URL/BPP_URL
# below, envsubst'd into index.html.template by entrypoint.sh at container
# startup (mirrors onix-bap/entrypoint.sh's templating pattern).

resource "google_cloud_run_v2_service" "landing_page" {
  name                = "landing-page"
  project             = var.project_id
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  depends_on          = [google_project_service.apis]

  template {
    service_account = google_service_account.cloud_run_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      name  = "landing-page"
      image = local.images.landing_page

      ports {
        container_port = 80
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "BAP_URL"
        value = google_cloud_run_v2_service.bap_frontend.uri
      }
      env {
        name  = "BPP_URL"
        value = google_cloud_run_v2_service.bpp_frontend.uri
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}
