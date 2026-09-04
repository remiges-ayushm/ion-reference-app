# No vpc_access needed — pure reverse proxy, no private-resource access.
# BAP_URL is one-directional (bap never references bap-frontend back), so no
# wiring patch is needed here, unlike bap<->onix-bap.

resource "google_cloud_run_v2_service" "bap_frontend" {
  name                = "bap-frontend"
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
      name  = "bap-frontend"
      image = local.images.bap_frontend

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
        value = "https://${var.bap_domain}"
      }
      env {
        name  = "NGINX_RESOLVER"
        value = "8.8.8.8 8.8.4.4"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}
