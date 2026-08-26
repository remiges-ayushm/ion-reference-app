# Remote state — shared source of truth with native locking, so two people
# (or a person and CI) can never corrupt state by applying at the same time.
# See terraform/README.md for the one-time bootstrap that creates this bucket.

terraform {
  backend "gcs" {
    bucket = "ion-sandbox-001-tfstate"
    prefix = "beckn-app"
  }
}
