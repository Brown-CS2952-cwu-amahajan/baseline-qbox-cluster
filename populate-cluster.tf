provider "helm" {
  kubernetes {
    host = "https://${google_container_cluster.primary.endpoint}"
    insecure = true
    username = "admin"
    password = var.password
  }
}

# Deliberately kept insecure in that it only uses HTTP Basic Auth. 
# We should fix this eventually, but good enough for testing for now.
provider "kubectl" {
  apply_retry_count = 3
  load_config_file = "false"

  host = "https://${google_container_cluster.primary.endpoint}"
  insecure = true
  username = "admin"
  password = var.password
}

resource "helm_release" "rabbit" {
  name = "rabbitmq"
  chart = "bitnami/rabbitmq"
  set {
    name = "rabbitmq.password"
    value = "qxevtnump90"
  }
}