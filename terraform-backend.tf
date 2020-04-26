terraform {
  backend "gcs" {
    bucket  = "tfstate-backend-v3"
    prefix  = "terraform/state"
  }
}