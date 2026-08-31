# NOTE: bpp <-> onix-bpp is a mutual reference — see cloud-run-wiring.tf,
# which patches BPP_URI and BPP_CALLER_URL once every service's URL is known.

resource "google_cloud_run_v2_service" "bpp" {
  name                = "bpp"
  project             = var.project_id
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  depends_on          = [google_project_service.apis, google_compute_subnetwork_iam_member.network_user, google_secret_manager_secret_iam_member.accessor, google_sql_database_instance.postgres]

  template {
    service_account = google_service_account.cloud_run_sa.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.subnet.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      name  = "bpp"
      image = local.images.bpp

      depends_on = ["cloudsql-proxy"]

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "APP_PORT"
        value = "8080"
      }
      env {
        name  = "APP_ENV"
        value = "production"
      }
      env {
        name  = "DB_HOST"
        value = "127.0.0.1"
      }
      env {
        name  = "DB_PORT"
        value = "5432"
      }
      env {
        name  = "DB_USER"
        value = var.db_user
      }
      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["postgres-password"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name  = "DB_NAME"
        value = var.db_name_bpp
      }
      env {
        name  = "DB_SSLMODE"
        value = "disable"
      }
      env {
        name  = "LOG_LEVEL"
        value = "info"
      }
      env {
        name  = "BPP_ID"
        value = var.bpp_id
      }
      env {
        name  = "NETWORK_ID"
        value = var.network_id
      }
      env {
        name  = "CDS_PUBLISH_URL"
        value = "${google_cloud_run_v2_service.onix_catalog_publish.uri}/catalog/publish"
      }
      env {
        name  = "CATALOG_BASE_URL"
        value = "https://${var.dedi_domain}"
      }
      env {
        name = "BPP_PRIVATE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["bpp-private-key"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "BPP_KEY_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["bpp-key-id"].secret_id
            version = "latest"
          }
        }
      }
      # Bootstrap placeholders, patched to the real value post-apply by
      # cloud-run-wiring.tf. NOT blank: bpp-application's config.go
      # validate() rejects an empty BPP_URI and os.Exit(1)s, which would
      # leave this Cloud Run revision permanently unready and deadlock the
      # wiring step (which depends_on this service existing). A
      # syntactically-valid dummy URL (reserved per RFC 2606, guaranteed
      # unroutable) satisfies validation for the few seconds until wiring
      # patches in the real onix-bpp URL.
      env {
        name  = "BPP_URI"
        value = "https://placeholder.invalid"
      }
      env {
        name  = "BPP_CALLER_URL"
        value = "https://placeholder.invalid/bpp/caller"
      }
    }

    containers {
      name  = "cloudsql-proxy"
      image = local.cloudsql_proxy_image
      args  = ["--structured-logs", "--address=0.0.0.0", "--port=5432", "--private-ip", google_sql_database_instance.postgres.connection_name]

      startup_probe {
        tcp_socket {
          port = 5432
        }
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 20
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}
