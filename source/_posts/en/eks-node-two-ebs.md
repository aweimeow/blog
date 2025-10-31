---
title: Give EKS Nodes a Dedicated EBS Volume for Containers
date: 2025-10-31
categories: [系統維運]
tags: [eks, ebs, containerd]
thumbnail: /images/eks-node-two-ebs/thumbnail.png
---

{% multilanguage tw eks-node-two-ebs %}

**Lately I have been hitting situations where containers overload the system disk on my EKS nodes. Once the root disk maxes out its throughput, the operating system freezes, CPU usage spikes, and the node drops into `NotReady`**. Even worse, the node stops accepting SSH, so I cannot inspect what actually went wrong. Kubernetes will eventually reschedule the Pods, but only after the node has stayed in `NotReady` for five minutes.

To keep this from happening again, **I split the system disk and the container data disk into two separate EBS volumes so that container workloads always land on the second volume.**

<!-- more -->

## Why split the volumes?

The second EBS volume exists for one reason: even if a workload drives the disk to its limits, only the container volume suffers while the system disk continues to run smoothly. That layout brings a few perks:

1. **Keep the system disk at the default 20 GiB**.
2. **Let the container data disk scale with the workload (for example 200 GiB)** so the pressure stays isolated. If a workload needs its own volume, you can still add an [Amazon EBS CSI](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html) PersistentVolume on top.

## Create a new Launch Template version

I run **Managed Node Groups** backed by a **Launch Template**, so I created a new version with two block devices:

```bash
REGION="eu-west-1"
aws ec2 create-launch-template \
  --region $REGION \
  --launch-template-name "eks-node-with-optimized-storage" \
  --launch-template-data '{
    "BlockDeviceMappings": [
      {
        "DeviceName": "/dev/xvda",
        "Ebs": {
          "Iops": 3000,
          "VolumeSize": 30,
          "VolumeType": "gp3",
          "Throughput": 125
        }
      },
      {
        "DeviceName": "/dev/xvdb",
        "Ebs": {
          "Iops": 6000,
          "VolumeSize": 50,
          "VolumeType": "gp3",
          "Throughput": 250
        }
      }
    ],
    "UserData": "TUlNRS1WZXJzaW9uOiAxLjAKQ29udGVudC1UeXBlOiBtdWx0aXBhcnQvbWl4ZWQ7IGJvdW5kYXJ5PSIvLyIKCi0tLy8KQ29udGVudC1UeXBlOiB0ZXh0L3gtc2hlbGxzY3JpcHQKCiMhL2Jpbi9iYXNoCgpzeXN0ZW1jdGwgc3RvcCBjb250YWluZXJkLnNlcnZpY2UKbWtmcy5leHQ0IC9kZXYvbnZtZTFuMQptdiAvdmFyL2xpYi9jb250YWluZXJkLyAvdmFyL2xpYi9jb250YWluZXJkLWJhY2t1cApta2RpciAtcCAvdmFyL2xpYi9jb250YWluZXJkCmVjaG8gL2Rldi9udm1lMW4xIC92YXIvbGliL2NvbnRhaW5lcmQgZXh0NCBkZWZhdWx0cyxub2F0aW1lIDEgMiA+PiAvZXRjL2ZzdGFiCm1vdW50IC1hCmNwIC1ydmYgL3Zhci9saWIvY29udGFpbmVyZC1iYWNrdXAvKiAvdmFyL2xpYi9jb250YWluZXJkLwpjaG1vZCAwNzUwIC92YXIvbGliL2NvbnRhaW5lcmQKc3lzdGVtY3RsIHN0YXJ0IGNvbnRhaW5lcmQuc2VydmljZQoKLS0vLy0tCg==",
    "SecurityGroupIds": ["<your-security-group-id>"]
  }'
```

The embedded **user data** decodes to the following script. It formats the second disk, writes the mount point into `fstab`, and copies the existing **containerd** data back into place.

```bash
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="//"

--//
Content-Type: text/x-shellscript

#!/bin/bash

systemctl stop containerd.service
mkfs.ext4 /dev/nvme1n1
mv /var/lib/containerd/ /var/lib/containerd-backup
mkdir -p /var/lib/containerd
echo /dev/nvme1n1 /var/lib/containerd ext4 defaults,noatime 1 2 >> /etc/fstab
mount -a
cp -rvf /var/lib/containerd-backup/* /var/lib/containerd/
chmod 0750 /var/lib/containerd
systemctl start containerd.service

--//--
```

**After the Managed Node Group picks up this launch template**, each node gets two EBS volumes. The second volume mounts to `/var/lib/containerd`, the location where container files live.

## Create the EKS managed node group

```bash
LT_ID=$(aws ec2 describe-launch-templates --region eu-west-1 --query "LaunchTemplates[?LaunchTemplateName=='eks-node-with-optimized-storage'].LaunchTemplateId" --output text)

# When you omit an AMI, Amazon Linux 2023 is used by default
aws eks create-nodegroup \
  --region eu-west-1 \
  --cluster-name <your-cluster-name> \
  --nodegroup-name <your-nodegroup-name> \
  --subnets subnet-xxx subnet-yyy \
  --node-role arn:aws:iam::<account-id>:role/<node-instance-role> \
  --launch-template id=$LT_ID,version=1 \
  --instance-types t3.medium \
  --scaling-config minSize=1,maxSize=3,desiredSize=2
```

**Once the nodes finish provisioning**, log in and check the block devices:

```bash
sh-5.2$ lsblk
NAME          MAJ:MIN RM SIZE RO TYPE MOUNTPOINTS
nvme1n1       259:0    0  50G  0 disk /var/lib/containerd
nvme0n1       259:1    0  30G  0 disk
├─nvme0n1p1   259:2    0  30G  0 part /
├─nvme0n1p127 259:3    0   1M  0 part
└─nvme0n1p128 259:4    0  10M  0 part /boot/efi
```

**Even if a Pod hammers the filesystem**, the load stays on `nvme1n1`, so the root disk (`nvme0n1`) keeps the node healthy. Other Pods that share the node might still slow down, but at least the node remains reachable for debugging.

## Deploy a test Pod

I asked **ChatGPT** to draft a Pod that pounds the disk. The Pod spins up a Ubuntu container and uses `stress-ng` to write heavily to disk:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: disk-stress-pod
  labels:
    app: disk-stress
spec:
  containers:
  - name: stress-ng
    image: ubuntu:22.04
    command: ["/bin/bash", "-c"]
    args:
      - |
        apt update && apt install -y stress-ng && \
        echo "Starting disk stress test..." && \
        stress-ng --hdd 4 --hdd-ops 10000000 --timeout 30m --metrics-brief
    resources:
      requests:
        cpu: "500m"
        memory: "512Mi"
      limits:
        cpu: "1"
        memory: "1Gi"
    volumeMounts:
      - name: test-volume
        mountPath: /data
  volumes:
    - name: test-volume
      emptyDir: {}
  restartPolicy: Never
```

Finally, I ran **sar (system activity report)** to validate the disk pressure. The throughput lands on `nvme1n1`, confirming the second disk absorbs the I/O burst.

```
sh-5.2$ sar -d 1 5
Linux 6.12.46-66.121.amzn2023.x86_64 (ip-192-168-94-143.eu-west-1.compute.internal)     10/31/25        _x86_64_        (2 CPU)

21:15:28          DEV       tps     rkB/s     wkB/s     dkB/s   areq-sz    aqu-sz     await     %util
21:15:29      nvme0n1     22.00      0.00    244.00      0.00     11.09      0.02      0.91      2.00
21:15:29      nvme1n1   1059.00      0.00 262688.00      0.00    248.05     16.35     15.44    100.00

21:15:29          DEV       tps     rkB/s     wkB/s     dkB/s   areq-sz    aqu-sz     await     %util
21:15:30      nvme0n1     20.00      0.00    224.00      0.00     11.20      0.02      0.95      2.00
21:15:30      nvme1n1   1022.00      0.00 254640.00      0.00    249.16     16.63     16.27    100.00
^C

Average:          DEV       tps     rkB/s     wkB/s     dkB/s   areq-sz    aqu-sz     await     %util
Average:      nvme0n1     21.00      0.00    234.00      0.00     11.14      0.02      0.93      2.00
Average:      nvme1n1   1040.50      0.00 258664.00      0.00    248.60     16.49     15.85    100.00
```

## Takeaways

**Splitting the volumes** keeps heavy container I/O from knocking the node offline. You can also define multiple node groups tailored to specific workloads, pairing them with the right EBS profile—for example, place high-I/O applications on nodes that ship with io1-based volumes.
