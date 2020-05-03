#!/bin/bash

set -x

build() {
	sudo microk8s.reset 
	sudo microk8s.enable dns helm3 storage 
	sudo microk8s.helm3 repo add bitnami https://charts.bitnami.com/bitnami
	sudo microk8s.helm3 install rabbitmq bitnami/rabbitmq --set rabbitmq.password=qxevtnump90
	sleep 3
	sudo microk8s.kubectl describe pods/rabbitmq-0
}

build
