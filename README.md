# About

Build the Q Coordination Engine (or `qbox`) and the Istio `BookInfo` application on top of GKE. 

# Prerequisites

 - Terraform 0.12 or later. If not installed, I strongly recommend using `tfswitch` (which can be installed [here](https://warrensbox.github.io/terraform-switcher/)) to install and move between Terraform versions.

 - A working `kubectl`. Follow [these instructions](https://kubernetes.io/docs/tasks/tools/install-kubectl/) to set up `kubectl` locally if not set. 

 - The third-party [`kubectl` Terraform provider](https://gavinbunney.github.io/terraform-provider-kubectl/docs/provider.html). Unfortunately, the standard Kubernetes provider does not currently support applying arbitrary YAMLs. This means we cannot apply CRDs or other resources through that provider. So we're using this one instead.

 - `gcloud` installed locally. Follow [these instructions](https://cloud.google.com/sdk/docs/downloads-interactive) to install `gcloud` for your platform.

 - `make` installed locally. This is so that you can run commands from the `Makefile` as needed. 

 - A service account key generated from Google Cloud for the project stored on your machine somewhere. This is necessary so that you can use `gcloud` to connect to GCP. If you don't have a service account, follow [these instructions](https://cloud.google.com/iam/docs/creating-managing-service-accounts). If you need to generate a key for an existing service account, follow [these instructions](https://cloud.google.com/iam/docs/creating-managing-service-account-keys) to generate and download.

 - A Terraform cloud storage bucket that you have access to. This is used to store [Terraform state](https://www.terraform.io/docs/state/index.html) remotely so that teams can work together on the same resources. A bucket called `tfstate-backend-v2` has already been created for you, and Terraform has already been configured to use it for state in this repo. If it is ever deleted, please create a new bucket and update `terraform-backend.tf` accordingly.  

 - Helm! Download the binary from `https://helm.sh/docs/intro/install/`. 

 - Add the Bitnami charts repo: `helm repo add bitnami https://charts.bitnami.com/bitnami`

 - A variable file called `values.tfvars` at the top-level of this repository. The following is a template, please replace the values:

 ```
 service_account_key_path = "<full path to the service account key JSON file you generated as a prereq>"
 password = "<Kubernetes API password for use with kubectl; consult with other team member for this value>"
 bookinfo_apps_path = "istio-microservices/bookinfo/platform/kube/bookinfo.yaml"
 productpage_config_file = "istio-microservices/bookinfo/platform/kube/configuration.yaml"
 ```

# Instructions

- Run `make build` to build a new cluster and deploy your YAML files.
- Run `make destroy` to teardown the cluster and all YAMLs running on it.
- Run `make show` to inspect the current state of the Terraform resources (YAMLs and GKE cluster)
