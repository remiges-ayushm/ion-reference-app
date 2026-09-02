output "bap_frontend_url" {
  value       = google_cloud_run_v2_service.bap_frontend.uri
  description = "Public URL — open this to use the BAP (buyer) app."
}

output "bpp_frontend_url" {
  value       = google_cloud_run_v2_service.bpp_frontend.uri
  description = "Public URL — open this to use the BPP (seller/admin) app."
}

output "bap_url" {
  value = google_cloud_run_v2_service.bap.uri
}

output "bpp_url" {
  value = google_cloud_run_v2_service.bpp.uri
}

output "onix_bap_url" {
  value = google_cloud_run_v2_service.onix_bap.uri
}

output "onix_bpp_url" {
  value = google_cloud_run_v2_service.onix_bpp.uri
}

output "onix_catalog_publish_url" {
  value = google_cloud_run_v2_service.onix_catalog_publish.uri
}

output "dedi_static_bucket" {
  value       = google_storage_bucket.dedi_static.name
  description = "Upload the rarely-changing bootstrap files here directly, e.g.: gsutil cp dedi.index.json gs://<this>/.well-known/dedi.index.json"
}

output "dedi_static_server_url" {
  value = google_cloud_run_v2_service.dedi_static.uri
}

output "landing_page_url" {
  value       = google_cloud_run_v2_service.landing_page.uri
  description = "Public URL — the entry-point page with buttons to the buyer and seller apps."
}

output "dedi_domain_dns_records" {
  value       = google_cloud_run_domain_mapping.dedi_apex.status[0].resource_records
  description = "DNS records to create at your registrar for var.dedi_domain."
}

output "dedi_domain_www_dns_records" {
  value       = google_cloud_run_domain_mapping.dedi_www.status[0].resource_records
  description = "DNS records to create at your registrar for var.dedi_domain_www."
}

output "artifact_registry_repo" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo_id}"
  description = "Push images here — see scripts/build-and-push.sh."
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "redis_host" {
  value = google_redis_instance.redis.host
}

output "vpc_name" {
  value = google_compute_network.vpc.name
}

output "subnet_name" {
  value = google_compute_subnetwork.subnet.name
}
