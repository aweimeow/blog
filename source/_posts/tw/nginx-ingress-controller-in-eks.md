---
title: 如何在 EKS 部署 Nginx Ingress Controller
date: 2024-01-27
categories: [系統維運]
tags: [eks, loadbalancer]
thumbnail: /images/nginx-ingress-controller-in-eks/thumbnail.png
---

{% multilanguage en nginx-ingress-controller-in-eks %}

花了一點時間研究了如何將 Nginx Ingress Controller 部署到 EKS 叢集當中。首先，我們可以決定要怎麼使用 Nginx Ingress Controller，你有幾種不同的選擇：

1. CLB or NLB：將控制器部署為 Classic Load Balancer 或 Network Load Balancer 類別
2. Public or Private：負載均衡器是可公開存取的或是僅能私有存取（只有位於你的 VPC 網路內才能夠存取）
3. HTTP or HTTPS：是否要配置 SSL，讓客戶端到 Load Balancer 之間有加密連線

<!-- more -->

### 選擇 CLB 或是 NLB

首先，先確定要使用的是 [Classic Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/introduction.html) 還是 [Network Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html)，從安裝上來說，當叢集裡面存在 AWS Load Balancer Controller 時，你的 Nginx Ingress Controller 會被建立成一個 Network Load Balancer（NLB）。若 AWS Load Balancer Controller 不存在，則會把該控制器部署為 Classic Load Balancer Controller（CLB）。由於 CLB 被 AWS 官方指南稱為上一代的負載平衡器 [1]，因此已經不推薦使用。

> A [Classic Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/classic/) is the Elastic Load Balancing previous-generation load balancer. It supports routing HTTP, HTTPS, or TCP request traffic to different ports on environment instances.

你可以使用 `kubectl -n ingress-nginx describe svc ingress-nginx-controller` 來檢查已部署的控制器是屬於 Classic Load Balancer 還是 Network Load Balancer：

```bash
# Classic Load Balancer 的網址範例
a878e058e56d0458ba59f88294c97283-e17eb490e17ec9e3.elb.eu-west-1.amazonaws.com

# Network Load Balancer 的網址範例，會使以 k8s-ingressn-ingressn- 作為開頭
k8s-ingressn-ingressn-e78cc5a707-15a0244dd914ab91.elb.eu-west-1.amazonaws.com
```
### 選擇可公開存取或僅能私有存取

在預設情況之下，AWS 負載平衡器預設為僅限私有存取，也就是說，只有與你相同 VPC 的其他機器（如：EC2 Instances）能夠存取這個負載平衡器的 endpoint。如果你想要安裝私有存取的負載平衡器，你可以直接按照 [Nginx Ingress Controller 文件](https://kubernetes.github.io/ingress-nginx/deploy/#cloud-deployments)中所述，執行以下的指令來進行安裝（請注意：以下命令的安裝版本為 `v1.8.2`，可能不是最新版本）：

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/aws/deploy.yaml
```

不過，如果你想要安裝的是可以提供公開存取能力的負載平衡器，你則需要修改其內容：

```bash
curl -O https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/aws/deploy.yaml
vim deploy.yaml
```

在 `deploy.yaml` 檔案之中找到這一段，並加上 annotation `service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"`，這會讓 AWS 配置此負載平衡器為可公開存取，你也可以從 [Annotations - AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.6/guide/service/annotations/#lb-scheme) 找到其他能夠設定的負載平衡器參數：

```yaml
# 找到 Service ingress-nginx-controller 的定義
kind: Service
metadata:
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-backend-protocol: tcp
    service.beta.kubernetes.io/aws-load-balancer-cross-zone-load-balancing-enabled: "true"
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-scheme: "internet-facing"     # <---- 加上這一行內容
  labels:
    app.kubernetes.io/component: controller
    app.kubernetes.io/instance: ingress-nginx
    app.kubernetes.io/name: ingress-nginx
    app.kubernetes.io/part-of: ingress-nginx
    app.kubernetes.io/version: 1.8.2
  name: ingress-nginx-controller
  namespace: ingress-nginx
```

### 配置 TLS 相關的設定

如果要進一步為負載平衡器配置 TLS，則需要參考 [Nginx Ingress Controller 文件](https://kubernetes.github.io/ingress-nginx/deploy/#cloud-deployments)中，將 `deploy.yaml` 下載，並修改其中的內容。

```bash
curl -O https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/aws/nlb-with-tls-termination/deploy.yaml
```

1. 將 `proxy-real-ip-cidr` 改成 EKS cluster 使用的 CIDR
2. 將 `service.beta.kubernetes.io/aws-load-balancer-ssl-cert` 當中的值填入要使用的憑證 ARN。

## 部署範例服務

我們使用 [Nginx 官方提供的 example](https://github.com/nginxinc/kubernetes-ingress/tree/v3.4.2/examples/ingress-resources/complete-example) 來進行改寫：
- cafe-ing.yaml：定義了 Ingress 物件。
- cafe-dep.yaml：定義了 `tea` 與 `coffee` 兩個不同 Service，各對應到一個 Pod。

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

## 進行測試

當部署好之後，我們能夠在我們的 EKS 叢集裡面確認 Service 與 Deployment 存在：

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
              /tea      tea-svc:80 (192.168.61.129:8080)                 # <--- 可以看到對於 /tea 與 /coffee 會把請求轉送到不同的 Service endpoint
              /coffee   coffee-svc:80 (192.168.34.195:8080)
Annotations:  <none>
Events:
  Type    Reason  Age                    From                      Message
  ----    ------  ----                   ----                      -------
  Normal  Sync    7m14s (x2 over 7m27s)  nginx-ingress-controller  Scheduled for sync
```

嘗試訪問 Nginx Ingress Controller 的 URL：

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