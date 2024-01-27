---
title: How to deploy Nginx Ingress Controller in EKS
date: 2024-01-27
categories: [系統維運]
tags: [eks, loadbalancer]
thumbnail: /images/nginx-ingress-controller-in-eks/thumbnail.png
---

{% multilanguage tw nginx-ingress-controller-in-eks %}

I spent some time researching how to deploy the Nginx Ingress Controller to an EKS cluster. Firstly, we can decide how to use the Nginx Ingress Controller, and you have several different choices:

1. CLB or NLB: Deploy the controller as either a Classic Load Balancer or a Network Load Balancer category.
2. Public or Private: The load balancer is either publicly accessible or private access only (only accessible within your VPC network).
3. HTTP or HTTPS: Whether to configure SSL, allowing encrypted connections between the client and the Load Balancer.

<!-- more -->

### Choosing CLB or NLB

Firstly, determine whether to use a [Classic Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/introduction.html) or a [Network Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html). In terms of installation, when an AWS Load Balancer Controller exists within the cluster, your Nginx Ingress Controller will be created as a Network Load Balancer (NLB). If the AWS Load Balancer Controller does not exist, then the controller will be deployed as a Classic Load Balancer Controller (CLB). As CLB is referred to as a previous generation load balancer by the AWS official guide [1], it is no longer recommended for use.

> A [Classic Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/) is the Elastic Load Balancing previous-generation load balancer. It supports routing HTTP, HTTPS, or TCP request traffic to different ports on environment instances.

You can use `kubectl -n ingress-nginx describe svc ingress-nginx-controller` to check whether the deployed controller is a Classic Load Balancer or a Network Load Balancer:

```bash
# Example URL for Classic Load Balancer
a878e058e56d0458ba59f88294c97283-e17eb490e17ec9e3.elb.eu-west-1.amazonaws.com

# Example URL for Network Load Balancer, starting with k8s-ingressn-ingressn-
k8s-ingressn-ingressn-e78cc5a707-15a0244dd914ab91.elb.eu-west-1.amazonaws.com
```
### Choosing Publicly Accessible or Private Access Only

By default, AWS load balancers are set to private access only, meaning only machines within the same VPC as you (such as EC2 Instances) can access this load balancer's endpoint. If you want to install a load balancer with private access, you can directly follow the instructions in the [Nginx Ingress Controller documentation](https://kubernetes.github.io/ingress-nginx/deploy/#cloud-deployments) and execute the following command for installation (please note: the installation version of the following command is `v1.8.2`, which may not be the latest version):

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/aws/deploy.yaml
```

However, if you want to install a load balancer that provides public access, you need to modify its content:

```bash
curl -O https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/aws/deploy.yaml
vim deploy.yaml
```

Find this section in the `deploy.yaml` file and add the annotation `service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"`. This will configure the AWS load balancer for public access. You can also find other load balancer parameters that can be set from [Annotations - AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.6/guide/service/annotations/#lb-scheme):

```yaml
# find definition for Service ingress-nginx-controller
kind: Service
metadata:
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-backend-protocol: tcp
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"      # <---- Add this line
  labels:
    app.kubernetes.io/component: controller
    app.kubernetes.io/instance: ingress-nginx
    app.kubernetes.io/name: ingress-nginx
    app.kubernetes.io/part-of: ingress-nginx
    app.kubernetes.io/version: 1.8.2
  name: ingress-nginx-controller
  namespace: ingress-nginx
```

### Configuring TLS-related Settings

To further configure TLS for the load balancer, refer to the [Nginx Ingress Controller documentation](https://kubernetes.github.io/ingress-nginx/deploy/#cloud-deployments), download the `deploy.yaml`, and modify its contents.

```bash
curl -O https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/aws/nlb-with-tls-termination/deploy.yaml
```

1. Change `proxy-real-ip-cidr` to the CIDR used by the EKS cluster.
2. Fill in the value of `service.beta.kubernetes.io/aws-load-balancer-ssl-cert` with the ARN of the certificate you wish to use.

## Deploying Example Services

We use the [example provided by Nginx](https://github.com/nginxinc/kubernetes-ingress/tree/v3.4.2/examples/ingress-resources/complete-example) for modification:
- cafe-ing.yaml: Defines the Ingress object.
- cafe-dep.yaml: Defines two different Services, `tea` and `coffee`, each corresponding to a Pod.

```yaml
# cafe-ing.yaml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: coffee
spec:
  replicas: 1
  selector:
    matchLabels:
      app: coffee
  template:
    metadata:
      labels:
        app: coffee
    spec:
      containers:
      - name: coffee
        image: nginxdemos/nginx-hello:plain-text
        ports:
        - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: coffee-svc
spec:
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http
  selector:
    app: coffee
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tea
spec:
  replicas: 1
  selector:
    matchLabels:
      app: tea
  template:
    metadata:
      labels:
        app: tea
    spec:
      containers:
      - name: tea
        image: nginxdemos/nginx-hello:plain-text
        ports:
        - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: tea-svc
  labels:
spec:
  ports:
  - port: 80
    targetPort: 8080
    protocol: TCP
    name: http
  selector:
    app: tea
```

```yaml
# cafe-ing.yaml

apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cafe-ingress
spec:
  ingressClassName: nginx
  rules:
  - http:
      paths:
      - path: /tea
        pathType: Prefix
        backend:
          service:
            name: tea-svc
            port:
              number: 80
      - path: /coffee
        pathType: Prefix
        backend:
          service:
            name: coffee-svc
            port:
              number: 80
```

## Conducting Tests

After deployment, we can confirm the existence of Service and Deployment within our EKS cluster:

```bash
$ kubectl get svc
NAME         TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
coffee-svc   ClusterIP   10.100.141.198   <none>        80/TCP    5m41s
kubernetes   ClusterIP   10.100.0.1       <none>        443/TCP   39d
tea-svc      ClusterIP   10.100.80.247    <none>        80/TCP    5m41s

$ kubectl get deployment
NAME     READY   UP-TO-DATE   AVAILABLE   AGE
coffee   1/1     1            1           6m
tea      1/1     1            1           6m

$ kubectl get pods -o wide
NAME                      READY   STATUS    RESTARTS   AGE    IP               NODE                                          NOMINATED NODE   READINESS GATES
coffee-7dd75bc79b-mhtdv   1/1     Running   0          9m8s   192.168.34.195   ip-192-168-39-19.eu-west-1.compute.internal   <none>           <none>
tea-df5655878-9vrp6       1/1     Running   0          9m8s   192.168.61.129   ip-192-168-39-19.eu-west-1.compute.internal   <none>           <none>

$ kubectl describe ingress cafe-ingress
Name:             cafe-ingress
Labels:           <none>
Namespace:        default
Address:          k8s-ingressn-ingressn-e78cc5a707-15a0244dd914ab91.elb.eu-west-1.amazonaws.com
Ingress Class:    nginx
Default backend:  <default>
Rules:
  Host        Path  Backends
  ----        ----  --------
  *
              /tea      tea-svc:80 (192.168.61.129:8080)                 # <--- The request will be forwarded to different endpoint based on uri
              /coffee   coffee-svc:80 (192.168.34.195:8080)
Annotations:  <none>
Events:
  Type    Reason  Age                    From                      Message
  ----    ------  ----                   ----                      -------
  Normal  Sync    7m14s (x2 over 7m27s)  nginx-ingress-controller  Scheduled for sync
```

Attempt to access the URL of the Nginx Ingress Controller:

```bash
$ curl k8s-ingressn-ingressn-e78cc5a707-15a0244dd914ab91.elb.eu-west-1.amazonaws.com/tea
Server address: 192.168.61.129:8080
Server name: tea-df5655878-9vrp6
Date: 27/Jan/2024:13:41:39 +0000
URI: /tea
Request ID: dd1c382348657763b2d50e565bd87839

$ curl k8s-ingressn-ingressn-e78cc5a707-15a0244dd914ab91.elb.eu-west-1.amazonaws.com/coffee
Server address: 192.168.34.195:8080
Server name: coffee-7dd75bc79b-mhtdv
Date: 27/Jan/2024:13:41:45 +0000
URI: /coffee
Request ID: fa9771896557c49d783955a6fe4b7e25
```