# Public static-file front end for the DeDi discovery chain
# (.well-known/dedi.index.json, dedi/ion-scratch-registry.json,
# index/becknCatalogs.index.json, catalogs/*.json.gz). Serves the same GCS
# bucket onix-catalog-publish writes into (gcs-dedi-static.tf), mounted
# read-only. Domain-mapped to the custom domain — see domain-mapping.tf.

resource "google_cloud_run_v2_service" "dedi_static" {
  name                = "dedi-static-server"
  project             = var.project_id
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  depends_on          = [google_project_service.apis, google_storage_bucket_iam_member.dedi_static_public_read]

  template {
    service_account       = google_service_account.cloud_run_sa.email
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    volumes {
      name = "dedi-static"
      gcs {
        bucket    = google_storage_bucket.dedi_static.name
        read_only = true
      }
    }

    containers {
      name  = "dedi-static-server"
      image = local.images.dedi_static_server

      env {
        name  = "ONIX_BPP_HOST"
        value = trimprefix(google_cloud_run_v2_service.onix_bpp.uri, "https://")
      }

      env {
        name  = "ONIX_BAP_HOST"
        value = trimprefix(google_cloud_run_v2_service.onix_bap.uri, "https://")
      }

      ports {
        container_port = 80
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      volume_mounts {
        name       = "dedi-static"
        mount_path = "/usr/share/nginx/html"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}
