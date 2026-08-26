# New Cloud SQL Postgres instance, owned by this project — see variables.tf
# for sizing (sql_tier etc, sandbox-appropriate defaults).

resource "google_sql_database_instance" "postgres" {
  name                = var.sql_instance_name
  project             = var.project_id
  region              = var.region
  database_version    = "POSTGRES_15"
  deletion_protection = false

  settings {
    tier              = var.sql_tier
    availability_type = var.sql_availability_type
    disk_type         = var.sql_disk_type
    disk_size         = var.sql_disk_size_gb

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled = var.sql_backup_enabled
    }
  }

  depends_on = [google_service_networking_connection.psa]
}

resource "google_sql_database" "trade_bap" {
  name     = var.db_name_bap
  project  = var.project_id
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_database" "trade_bpp" {
  name     = var.db_name_bpp
  project  = var.project_id
  instance = google_sql_database_instance.postgres.name
}

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "google_sql_user" "trade" {
  name     = var.db_user
  project  = var.project_id
  instance = google_sql_database_instance.postgres.name
  password = random_password.postgres.result
}
