locals {
  registry = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo_id}"

  images = {
    bap                  = "${local.registry}/bap-application:${var.image_tag}"
    bap_migrate          = "${local.registry}/bap-application-migrate:${var.image_tag}"
    bpp                  = "${local.registry}/bpp-application:${var.image_tag}"
    bpp_migrate          = "${local.registry}/bpp-application-migrate:${var.image_tag}"
    bap_frontend         = "${local.registry}/bap-frontend:${var.image_tag}"
    bpp_frontend         = "${local.registry}/bpp-frontend:${var.image_tag}"
    onix_bap             = "${local.registry}/onix-bap:${var.image_tag}"
    onix_bpp             = "${local.registry}/onix-bpp:${var.image_tag}"
    onix_catalog_publish = "${local.registry}/onix-catalog-publish:${var.image_tag}"
    dedi_static_server   = "${local.registry}/dedi-static-server:${var.image_tag}"
  }

  cloudsql_proxy_image = "gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14.2"
}
