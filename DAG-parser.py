import json
import sys
import yaml
import os
import shutil
import stat

class TerraformTemplate:
    def __init__(self, tfvars, services):
        self.tfvars = tfvars
        string = ""
        for i, s in enumerate(services):
            if i != 0:
                string += " && "
            string += f"kubectl create configmap {s}-configmap --from-file test/{s}/config.yaml"
        f = open(tfvars, "r")
        v_str = f.read()
        self.template = v_str + f"""
bookinfo_apps_path = "test/test.yaml"
add_configmap = "{string}"
"""
        f.close()
    def write2file(self, f):
        f.write(self.template)

class DeploymentTemplate:
    def __init__(self, name, bad, middle):
        self.template = \
            {
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {
                    "name": name,
                    "labels": {
                        "app": name,
                        "version": "v1"
                    }
                },
                "spec": {
                    "replicas": 1,
                    "selector": {
                        "matchLabels": {
                            "app": name,
                            "version": "v1"
                        }
                    },
                    "template": {
                        "metadata": {
                            "labels": {
                                "app": name,
                                "version": "v1"
                            }
                        },
                        "spec": {
                            "containers": [
                                {
                                    "name": name,
                                    "image": "docker.io/cs2952fspring2020amahajcwu/baseline-fake-service:latest" if not bad \
                                        else "docker.io/cs2952fspring2020amahajcwu/fake-service-bad:latest",
                                    "imagePullPolicy": "Always",
                                    "ports": [
                                        {
                                            "containerPort": 9080
                                        }
                                    ],
                                    "env": [{
                                        "name": "INCOMING_QUEUE_NAME",
                                        "value": name
                                    }, {
                                        "name": "CHILD_QUEUES",
                                        "value": ";".join(middle)
                                    }, {
                                        "name": "HANDLE_RESPONSES_QUEUE",
                                        "value": name + "-responses"
                                    }]
                                }
                            ]
                        }
                    }
                }
            }

        if middle:
            self.template["spec"]["template"]["spec"]["containers"][0]["env"].append({
                "name": "INTERMEDIATE",
                "value": "True"
            })
        if bad:
            self.template["spec"]["template"]["spec"]["containers"][0]["env"].append({
                "name": "SHOULD_FAIL",
                "value": "True"
            })

    def get_file(self):
        return self.template

class ServiceTemplate:
    def __init__(self, name):
        self.template =  \
        {
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {
                "name": name,
                "labels": {
                    "app": name,
                    "service": name
                }
            },
            "spec": {
                "ports": [
                    {
                        "port": 9080,
                        "name": "http"
                    }
                ],
                "selector": {
                    "app": name
                },
                "type": "LoadBalancer"
            }
        }
    
    def get_file(self):
        return self.template

def config_generator(file, tfvars, dir='.'):
    if os.path.isdir(os.path.join(dir, "test")):
        shutil.rmtree(os.path.join(dir, "test"))
    os.mkdir(os.path.join(dir, "test"))
    
    f = open(file, "r")
    obj = json.load(f)
    f.close()
    root = obj["root"]

    test_yaml = []
    services = []

    for service in obj["nodes"]:
        test_yaml.append(DeploymentTemplate(service, service in obj["bad"], obj["edges"].get(service, [])).get_file())
    
    for service in obj["nodes"]:
        test_yaml.append(ServiceTemplate(service).get_file())
    f = open(os.path.join(dir, "test", "test.yaml"), "w")
    yaml.safe_dump_all(test_yaml, f)
    f.close()

if __name__ == "__main__":
    config_generator(sys.argv[1], sys.argv[2])
