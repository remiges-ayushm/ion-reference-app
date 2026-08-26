# New Memorystore Redis instance, owned by this project. Dedicated to this
# app — no cross-tenant cache-collision risk (unlike the old reused-instance
# setup). onix-bap and onix-bpp both point their REDIS_ADDR at this instance.

resource "google_redis_instance" "redis" {
  name           = var.redis_instance_name
  project        = var.project_id
  region         = var.region
  tier           = var.redis_tier
  memory_size_gb = var.redis_memory_size_gb
  redis_version  = "REDIS_7_0"

  authorized_network = google_compute_network.vpc.id
  connect_mode       = "DIRECT_PEERING"
  reserved_ip_range  = var.redis_reserved_ip_range

  depends_on = [google_project_service.apis]
}
