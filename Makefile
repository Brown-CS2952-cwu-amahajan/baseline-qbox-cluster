CREDENTIALS:=$$(cat values.tfvars | grep service_account_key_path | cut -d "\"" -f 2)
EXTERNAL_IPS:=$$(gcloud compute forwarding-rules list | grep us-central | cut -d ' '  -f 1)

build:
	GOOGLE_APPLICATION_CREDENTIALS=$(CREDENTIALS) terraform init
	GOOGLE_APPLICATION_CREDENTIALS=$(CREDENTIALS) terraform apply -auto-approve -var-file="values.tfvars"

destroy:
	GOOGLE_APPLICATION_CREDENTIALS=$(CREDENTIALS) terraform destroy -auto-approve -var-file="values.tfvars"
	gcloud compute forwarding-rules delete --region us-central1 --quiet $(EXTERNAL_IPS)
show:
	GOOGLE_APPLICATION_CREDENTIALS=$(CREDENTIALS) terraform show
