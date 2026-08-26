# Migration jobs — run manually after each deploy/schema change via:
#   gcloud run jobs execute migrate-bap --region=<region> --project=<project> --wait
#   gcloud run jobs execute migrate-bpp --region=<region> --project=<project> --wait
# Not triggered automatically by `terraform apply`.
#
# google_cloud_run_v2_job nests one level deeper than google_cloud_run_v2_service
# (template.template.containers, not template.containers).
#
# tern.conf (in db/migrations/) already reads PGHOST/PGPORT/PGDATABASE/PGUSER/
# PGPASSWORD as overrides — zero app-side changes needed to point it at the
# Cloud SQL Auth Proxy sidecar instead of localhost.

resource "google_cloud_run_v2_job" "migrate_bap" {
  name       = "migrate-bap"
  project    = var.project_id
  location   = var.region
  depends_on = [google_project_service.apis, google_compute_subnetwork_iam_member.network_user, google_secret_manager_secret_iam_member.accessor, google_sql_database_instance.postgres]

  template {
    template {
      service_account = google_service_account.cloud_run_sa.email
      timeout         = "600s"

      vpc_access {
        network_interfaces {
          network    = google_compute_network.vpc.id
          subnetwork = google_compute_subnetwork.subnet.id
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        name  = "migrate"
        image = local.images.bap_migrate

        depends_on = ["cloudsql-proxy"]

        env {
          name  = "PGHOST"
          value = "127.0.0.1"
        }
        env {
          name  = "PGPORT"
          value = "5432"
        }
        env {
          name  = "PGDATABASE"
          value = var.db_name_bap
        }
        env {
          name  = "PGUSER"
          value = var.db_user
        }
        env {
          name = "PGPASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this["postgres-password"].secret_id
              version = "latest"
            }
          }
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
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image]
  }
}

resource "google_cloud_run_v2_job" "migrate_bpp" {
  name       = "migrate-bpp"
  project    = var.project_id
  location   = var.region
  depends_on = [google_project_service.apis, google_compute_subnetwork_iam_member.network_user, google_secret_manager_secret_iam_member.accessor, google_sql_database_instance.postgres]

  template {
    template {
      service_account = google_service_account.cloud_run_sa.email
      timeout         = "600s"

      vpc_access {
        network_interfaces {
          network    = google_compute_network.vpc.id
          subnetwork = google_compute_subnetwork.subnet.id
        }
        egress = "PRIVATE_RANGES_ONLY"
      }

      containers {
        name  = "migrate"
        image = local.images.bpp_migrate

        depends_on = ["cloudsql-proxy"]

        env {
          name  = "PGHOST"
          value = "127.0.0.1"
        }
        env {
          name  = "PGPORT"
          value = "5432"
        }
        env {
          name  = "PGDATABASE"
          value = var.db_name_bpp
        }
        env {
          name  = "PGUSER"
          value = var.db_user
        }
        env {
          name = "PGPASSWORD"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.this["postgres-password"].secret_id
              version = "latest"
            }
          }
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
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image]
  }
}
