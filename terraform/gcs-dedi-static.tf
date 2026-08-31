# Public static-file storage for the DeDi discovery chain
# (.well-known/dedi.index.json -> dedi/ion-scratch-registry.json ->
# index/becknCatalogs.index.json -> catalogs/*.json.gz), served on a custom
# domain via dedi-static-server (cloud-run-dedi-static.tf) and written into
# by onix-catalog-publish (mounted as its outputRoot — see
# cloud-run-onix-catalog-publish.tf). Object paths inside this bucket are the
# exact public URL paths — no prefix.

resource "google_storage_bucket" "dedi_static" {
  name                        = "${var.project_id}-dedi-static"
  project                     = var.project_id
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true

  # Required for the allUsers IAM binding below to actually take effect — a
  # project/org with the "Public access prevention" org policy enforced will
  # still reject it regardless of this setting; that's an external policy
  # check outside Terraform's control.
  public_access_prevention = "inherited"

  versioning {
    enabled = true
  }
}

resource "google_storage_bucket_iam_member" "dedi_static_public_read" {
  bucket = google_storage_bucket.dedi_static.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

# onix-catalog-publish writes here (its outputRoot). dedi-static-server reads
# the same bucket read-only to serve it publicly.
resource "google_storage_bucket_iam_member" "dedi_static_writer" {
  bucket = google_storage_bucket.dedi_static.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}
