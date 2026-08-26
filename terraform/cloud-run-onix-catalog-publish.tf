# DS-internal, same-operator service: bpp forwards signed catalog/publish
# requests here (see cloud-run-bpp.tf's CDS_PUBLISH_URL). Reuses onix-bpp's
# registered identity (bpp-onix-* secrets) — no separate identity, nothing
# new to seed via scripts/seed-secrets.sh. Unlike bap<->onix-bap and
# bpp<->onix-bpp, this is one-directional (bpp depends on this service, not
# the reverse), so it needs no cloud-run-wiring.tf placeholder-patch step.
#
# outputRoot (/beckn) is plain container-local storage — ephemeral, lost on
# restart/scale-to-zero. Deliberate for now; see README.md.

resource "google_cloud_run_v2_service" "onix_catalog_publish" {
  name                = "onix-catalog-publish"
  project             = var.project_id
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  depends_on          = [google_project_service.apis, google_compute_subnetwork_iam_member.network_user, google_secret_manager_secret_iam_member.accessor, google_redis_instance.redis]

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
      name  = "onix-catalog-publish"
      image = local.images.onix_catalog_publish

      ports {
        container_port = 8085
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "REDIS_ADDR"
        value = "${google_redis_instance.redis.host}:${google_redis_instance.redis.port}"
      }
      env {
        name  = "NETWORK_PARTICIPANT"
        value = var.bpp_id
      }
      env {
        name = "BPP_ONIX_KEY_ID"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["bpp-onix-key-id"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "BPP_ONIX_SIGNING_PRIVATE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["bpp-onix-signing-private-key"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "BPP_ONIX_SIGNING_PUBLIC_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["bpp-onix-signing-public-key"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "BPP_ONIX_ENCR_PRIVATE_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["bpp-onix-encr-private-key"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "BPP_ONIX_ENCR_PUBLIC_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.this["bpp-onix-encr-public-key"].secret_id
            version = "latest"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}
