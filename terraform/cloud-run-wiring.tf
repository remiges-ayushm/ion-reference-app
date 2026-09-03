# bap<->onix-bap and bpp<->onix-bpp are genuinely cyclic dependencies —
# Terraform's resource graph can't express a cycle, so each service above is
# created with those specific cross-referencing env vars set to a bootstrap
# placeholder, and this single step patches them all in afterwards via
# `gcloud run services update`, once every service's URL is actually known.
#
# `always_run` (timestamp()) makes this re-apply on EVERY `terraform apply`,
# not just when a URL changes. This looks wasteful but is load-bearing: the
# resource blocks in cloud-run-bap.tf/cloud-run-bpp.tf/cloud-run-onix-*.tf
# permanently declare these env vars as the placeholder value. Any apply that
# touches bap/bpp/onix-bap/onix-bpp for ANY reason (a memory bump, an
# unrelated env var) makes Terraform reconcile the live service back to that
# declared placeholder, silently undoing this patch — a trigger keyed only on
# the 4 services' .uri values would miss that reversion (the URIs themselves
# don't change) and never re-run to fix it, leaving cross-service routing
# broken until someone notices. Matches the reference project's own choice
# for the same reason. Requires the gcloud CLI, authenticated, on the machine
# running `terraform apply`.
#
# --container is passed explicitly for bap/bpp since both have a second
# "cloudsql-proxy" sidecar container — gcloud's container-scoped flags
# (--update-env-vars included) apply ambiguously without it once a service
# has more than one container.

resource "null_resource" "wire_service_urls" {
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    command     = <<-EOT
      set -euo pipefail

      # BAP_URI/BPP_URI are what other network participants use to route
      # callbacks (e.g. {bapUri}/on_select) — they MUST include the receiver
      # path (bapTxnReceiver/bppTxnReceiver are mounted at /bap/receiver/ and
      # /bpp/receiver/ respectively, see config/local-simple-b*p.yaml),
      # routed through the custom domain via dedi-static-server's nginx
      # proxy rules. ADAPTER_URL/BPP_CALLER_URL are the internal call target
      # our own apps POST to directly (bare Cloud Run URL + /bap/caller, no
      # domain needed — service-to-service within the same project).
      gcloud run services update ${google_cloud_run_v2_service.bap.name} \
        --project=${var.project_id} --region=${var.region} --quiet \
        --container=bap \
        --update-env-vars="BAP_URI=https://${var.dedi_domain}/bap/receiver/,ADAPTER_URL=${google_cloud_run_v2_service.onix_bap.uri}/bap/caller"

      gcloud run services update ${google_cloud_run_v2_service.onix_bap.name} \
        --project=${var.project_id} --region=${var.region} --quiet \
        --update-env-vars="BAP_URL=${google_cloud_run_v2_service.bap.uri}"

      gcloud run services update ${google_cloud_run_v2_service.bpp.name} \
        --project=${var.project_id} --region=${var.region} --quiet \
        --container=bpp \
        --update-env-vars="BPP_URI=https://${var.dedi_domain}/bpp/receiver/,BPP_CALLER_URL=${google_cloud_run_v2_service.onix_bpp.uri}/bpp/caller"

      gcloud run services update ${google_cloud_run_v2_service.onix_bpp.name} \
        --project=${var.project_id} --region=${var.region} --quiet \
        --update-env-vars="BPP_URL=${google_cloud_run_v2_service.bpp.uri}"
    EOT
  }

  depends_on = [
    google_cloud_run_v2_service.bap,
    google_cloud_run_v2_service.bpp,
    google_cloud_run_v2_service.onix_bap,
    google_cloud_run_v2_service.onix_bpp,
  ]
}
