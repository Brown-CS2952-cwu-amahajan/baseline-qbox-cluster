terraform {
  backend "gcs" {
    bucket  = "tfstate-backend-v2"
    prefix  = "terraform/state"
  }
}