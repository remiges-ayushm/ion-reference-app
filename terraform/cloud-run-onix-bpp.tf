# NOTE: onix-bpp <-> bpp is a mutual reference — see cloud-run-wiring.tf,
# which patches BPP_URL once every service's URL is known.

resource "google_cloud_run_v2_service" "onix_bpp" {
  name                = "beckn-onix-bpp"
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
      name  = "onix-bpp"
      image = local.images.onix_bpp

      ports {
        container_port = 8082
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
      # Bootstrap placeholder, patched to the real value post-apply by
      # cloud-run-wiring.tf. NOT blank: if left empty, entrypoint.sh's
      # envsubst would render local-simple-routing-BPPReceiver.yaml's target
      # url as the scheme-less, host-less string "/api/webhook" — whether the
      # vendor onix binary eagerly validates/rejects that at startup (versus
      # only when routing a request) is unverified from outside the image,
      # so use a syntactically-valid placeholder rather than risk it.
      env {
        name  = "BPP_URL"
        value = "https://placeholder.invalid"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
}
