---
title: The IAM Role for Service Account behind the scene
date: 2024-10-30 20:00:00
categories: [AWS things]
tags: [AWS, EKS, IRSA, Pod Identity]
thumbnail: /images/eks-irsa-mechanism/thumbnail.png
---

Within Amazon EKS, we use IAM Role for Service Account (IRSA) or Pod Identity Agent (IRSAv2) to grant applications permission to call AWS APIs. While Pod Identity Agent won't be covered in this article, we'll explore how IRSA works in your EKS cluster. Understanding this feature better will help you troubleshoot issues when they arise.

<!-- more -->

## What is IRSA and Why Do We Need It?

Applications running in your cluster may need to call AWS APIs to manage AWS resources. For example, when you install an EKS Add-on like the EBS CSI Controller, it needs to interact with AWS APIs to perform tasks such as mounting EBS volumes to EKS worker nodes. The kubelet can then mount these volumes into Pods via the [Container Storage Interface](https://kubernetes.io/blog/2019/01/15/container-storage-interface-ga/).

Let's look at an example of a Service Account. In the following output, we can see the Service Account `s3-readonly-sa` has an annotation `eks.amazonaws.com/role-arn` with the value `arn:aws:iam::123456789012:role/AmazonEKSPodS3ReadOnlyAccessRole`:

```yaml
kubectl describe sa s3-readonly-sa
Name:                s3-readonly-sa
Namespace:           default
Labels:              <none>
Annotations:         eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/AmazonEKSPodS3ReadOnlyAccessRole
Image pull secrets:  <none>
Mountable secrets:   <none>
Tokens:              <none>
Events:              <none>
```

This means that any Pod associated with this service account will be granted permissions to operate AWS APIs according to the IAM policies attached to the specified IAM role.

## How IRSA Works

### Step 1: Pod Mutation

You might wonder, "How does the Service Account give a Pod permission to call AWS APIs?"

![The workflow of creating a Pod](/images/eks-irsa-mechanism/pod-creation-workflow.png)

When a Pod is created, the Kubernetes API server receives the creation request. In EKS, a pre-installed [AdmissionWebhook](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/) called `pod-identity-webhook` intercepts this request. The API server passes the Pod manifest to the assigned controller, which then mutates or validates the Pod specification.

Here's an example of the MutatingWebhook resource installed in an EKS cluster. Notice in the **Rules** block that it's registered for `verb=CREATE requestURI=/v1/pods/`:

```yaml
kubectl describe mutatingwebhookconfiguration pod-identity-webhook
Name:         pod-identity-webhook
Namespace:
Labels:       <none>
Annotations:  <none>
API Version:  admissionregistration.k8s.io/v1
Kind:         MutatingWebhookConfiguration
Metadata:
  Creation Timestamp:  <redacted>
  Generation:          1
  Resource Version:    296
  UID:                 <redacted>
Webhooks:
  Admission Review Versions:
    v1beta1
  Client Config:
    Ca Bundle:     
    URL:           https://127.0.0.1:23443/mutate
  Failure Policy:  Ignore
  Match Policy:    Equivalent
  Name:           iam-for-pods.amazonaws.com
  Namespace Selector:
  Object Selector:
  Reinvocation Policy:  IfNeeded
  Rules:
    API Groups:
    API Versions:
      v1
    Operations:
      CREATE
    Resources:
      pods
    Scope:          *
  Side Effects:     None
  Timeout Seconds:  10
Events:             <none>
```

### Step 2: Injected Information in Newly Created Pods

When a Pod is created, the MutatingWebhook captures the event, and the Mutating Controller updates the Pod manifest by adding necessary information to make IRSA work. We can observe these changes using the `kubectl get pod` command:

```yaml
$ kubectl get pod mypod -o yaml
apiVersion: v1
kind: Pod
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"v1","kind":"Pod","metadata":{"annotations":{},"name":"mypod","namespace":"default"},"spec":{"containers":[{"image":"amazon/aws-cli","name":"s3-readonly"}],"serviceAccount":"s3-readonly-sa"}}
  creationTimestamp: "2024-10-29T20:24:42Z"
  name: mypod
  namespace: default
  resourceVersion: "97891577"
  uid: 904ad3ac-d7d0-4301-96dc-bca61fab86fe
spec:
  containers:
  - env:
    - name: AWS_STS_REGIONAL_ENDPOINTS
      value: regional
    - name: AWS_DEFAULT_REGION
      value: eu-west-1
    - name: AWS_REGION
      value: eu-west-1
    - name: AWS_ROLE_ARN
      value: arn:aws:iam::1234567889012:role/AmazonEKSPodS3ReadOnlyAccessRole
    - name: AWS_WEB_IDENTITY_TOKEN_FILE
      value: /var/run/secrets/eks.amazonaws.com/serviceaccount/token
    image: amazon/aws-cli
    imagePullPolicy: Always
    name: s3-readonly
    resources: {}
    terminationMessagePath: /dev/termination-log
    terminationMessagePolicy: File
    volumeMounts:
    - mountPath: /var/run/secrets/kubernetes.io/serviceaccount
      name: kube-api-access-l9zvj
      readOnly: true
    - mountPath: /var/run/secrets/eks.amazonaws.com/serviceaccount
      name: aws-iam-token
      readOnly: true
  dnsPolicy: ClusterFirst
  enableServiceLinks: true
  nodeName: ip-192-168-48-232.eu-west-1.compute.internal
  preemptionPolicy: Never
  priority: 0
  priorityClassName: default-priority
  restartPolicy: Always
  schedulerName: default-scheduler
  securityContext: {}
  serviceAccount: s3-readonly-sa
  serviceAccountName: s3-readonly-sa
  terminationGracePeriodSeconds: 30
  tolerations:
  - effect: NoExecute
    key: node.kubernetes.io/not-ready
    operator: Exists
    tolerationSeconds: 300
  - effect: NoExecute
    key: node.kubernetes.io/unreachable
    operator: Exists
    tolerationSeconds: 300
  volumes:
  - name: aws-iam-token
    projected:
      defaultMode: 420
      sources:
      - serviceAccountToken:
          audience: sts.amazonaws.com
          expirationSeconds: 86400
          path: token
  - name: kube-api-access-l9zvj
    projected:
      defaultMode: 420
      sources:
      - serviceAccountToken:
          expirationSeconds: 3607
          path: token
      - configMap:
          items:
          - key: ca.crt
            path: ca.crt
          name: kube-root-ca.crt
      - downwardAPI:
          items:
          - fieldRef:
              apiVersion: v1
              fieldPath: metadata.namespace
            path: namespace
status:
...
```

The mutating webhook adds several components:

1. Environment variables in `.spec.containers[].env`: These variables are used by the AWS SDK to identify which AWS regional endpoint to interact with.
2. Volume mounts in `.spec.containers[].volumeMounts`: These instruct kubelet to mount the secret token into the container's filesystem.
3. Volumes in `.spec.volumes`: Two volumes are configured - one for calling the Kubernetes API server and another for interacting with AWS API server.

### Step 3: TokenRequest Initiated by Kubelet

When the Pod is created on a node, kubelet initiates a [TokenRequest](https://kubernetes.io/docs/reference/kubernetes-api/authentication-resources/token-request-v1/) to the EKS control plane. The control plane returns a JWT token, which is stored in the mounted location:

```shell
bash-4.2# ls /var/run/secrets/eks.amazonaws.com/serviceaccount
token
bash-4.2# cat /var/run/secrets/eks.amazonaws.com/serviceaccount/token && echo
eyJhbGciOiJSUzI1NiIsImtpZCI6IjMyNzc1ZWNmNDU1MzRkOWIyOTdlNTA0ZmQ3ZTk0MDMwMDIzNjlmYmEifQ.eyJhdWQiOlsic3RzLmFtYXpvbmF3cy5jb20iXSwiZXhwIjoxNzMwMzIwNDAzLCJpYXQiOjE3MzAyMzQwMDMsImlzcyI6Imh0dHBzOi8vb2lkYy5la3MuZXUtd2VzdC0xLmFtYXpvbmF3cy5jb20vaWQvOEJBQzhCMTA3REMxMjkyRTQyNkZGNDU2RTZBOUI2NDMiLCJqdGkiOiI3ZDk2YjI1Yi02YzNlLTQ5NWUtOTk3Yi1jY2MxODg4MTA4MTYiLCJrdWJlcm5ldGVzLmlvIjp7Im5hbWVzcGFjZSI6ImRlZmF1bHQiLCJub2RlIjp7Im5hbWUiOiJpcC0xOTItMTY4LTQ4LTIzMi5ldS13ZXN0LTEuY29tcHV0ZS5pbnRlcm5hbCIsInVpZCI6ImNlZjk1ZmFkLTk2NTQtNGZmZi1iNzE4LTRmMmIxOTk3NTUwNiJ9LCJwb2QiOnsibmFtZSI6Im15cG9kIiwidWlkIjoiMmYzMzYwOTgtZDgxMC00MzM4LTk5MjgtYzNiMWEyMjU4MWM1In0sInNlcnZpY2VhY2NvdW50Ijp7Im5hbWUiOiJzMy1yZWFkb25seS1zYSIsInVpZCI6IjAwNWZjNWM0LTYzMmItNDQ2Yy05NjI0LWY4YjBjY2RmYjY5ZSJ9fSwibmJmIjoxNzMwMjM0MDAzLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6ZGVmYXVsdDpzMy1yZWFkb25seS1zYSJ9.JLqxSG1ImL-QIMVpKLKG2lT0uRezzcTY-gDswoq97Bj3IAnoNpXu0bXTVGzJtm39bo42eq8jqsQ1nACVyY2wdI65cazBMVCqaS8uxueWzfP1XoL604v2LhuzSZOURtCAJCglrhkSZqZNaEnVnHQ0wVdXYSkkWVL-czy0IClgtyM8viIW-l3ZBlK9pOclioj7sd3Y9oi2Zb5KERpTcaElTJRD3oFkD_KHq84O0oxxjlRRTeo3Lzl5t7CC0rxDaZYhFGQZ2jVGZm43FrfOl6r5mSIjvR-HIJcKcEJbgxHcESbbw8CDcOCkvRz3Tl75wS64x41fy559LafzXxLDrq79jA
```

This credential can be decoded using a [JWT tool](https://jwt.io). The information must exactly match what's in the IAM Role's Trust Entity; otherwise, you'll encounter authentication errors when the Pod tries to authenticate with the AWS STS service.

![The information decoded by JWT tool](/images/eks-irsa-mechanism/jwt-token.png)

### Step 4: AWS SDK's Interaction with AWS STS Service

Finally, the program in the Pod uses the AWS SDK to interact with AWS APIs. The SDK looks for AWS credentials using the `AWS_WEB_IDENTITY_TOKEN_FILE` environment variable. The Pod then makes an [AssumeRoleWithWebIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html) API call to assume the IAM role, granting it access according to the policies attached to that role.

```shell
bash-4.2# aws sts get-caller-identity
{
    "UserId": "AROAR6B3GN5XUQAZEA2LF:botocore-session-1730234716",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/AmazonEKSPodS3ReadOnlyAccessRole/botocore-session-1730234716"
}

bash-4.2# aws s3 ls
2024-03-27 13:46:58 aws-codebuild-output-test
```

## What Happens Without a Dedicated IAM Role?

If you don't configure your application with a dedicated IAM role, the Pod (AWS SDK) will attempt to get credentials from the EC2 Instance Metadata Service (IMDS). Here's the workflow:

1. AWS SDK fails to find credentials in local files (e.g., `/var/run/secrets/eks.amazonaws.com/serviceaccount/token`)
2. AWS SDK attempts to get credentials by calling the [EC2 Metadata Service IP (169.254.169.254)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instancedata-data-retrieval.html)
3. The request travels through the Pod's default gateway to the EKS node's main interface (eth0)
4. The EKS node forwards the request to EC2 Metadata Service and receives temporary credentials
5. The EKS node returns the credentials to the Pod

This approach has a significant security implication: **the Pod inherits all permissions granted to the EC2 instance**. EKS worker nodes typically have [several AWS managed IAM policies](https://docs.aws.amazon.com/eks/latest/userguide/create-node-role.html) for tasks like pulling images from ECR or attaching network interfaces to EC2 instances.

While it's possible to use the EKS worker node's IAM role for Pods, this practice poses security risks to your AWS account and should be avoided.

## Conclusion

We've explored the internal mechanisms of how IRSA works within Pods and EKS. This understanding is crucial for proper implementation and troubleshooting. Feel free to share any questions or comments!
