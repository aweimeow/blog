---
title: 為 EKS 節點建立容器專用的 EBS 磁區
date: 2025-10-31
categories: [系統維運]
tags: [eks, ebs, containerd]
thumbnail: /images/eks-node-two-ebs/thumbnail.png
---

{% multilanguage en eks-node-two-ebs %}

**最近碰到在 EKS cluster 中，容器對系統磁碟的壓力過大狀況，這種情況會因為系統磁碟效能達到上限，作業系統無法正常運作，CPU 使用率飆高，最後節點進入 NotReady 狀態**。尤其，在這種情況發生時，我們只能看到節點處於 NotReady 狀態，無法觀測到是哪一個部分出了問題，同時，因我們也沒辦法連入節點了。儘管 Kubernetes 具備自動恢復的能力，但在節點 NotReady 過了五分鐘後，才會將 Pod 刪除並重新部署到 EKS cluster 當中。

為了避免這個反覆發生，**我把節點的系統磁碟和容器資料磁碟拆開為兩個 EBS 磁區，以確保容器只會使用第二顆 EBS volume。**

<!-- more -->

## 這麼做有什麼好處？

第二個 EBS 的目的很單純：就算容器把硬碟效能逼到上限，也只會影響容器專用的硬碟，系統硬碟的效能不受影響。這種做法有一些好處：

1. **系統碟可以保持在 20 GiB 的預設大小**。
2. **容器資料硬碟依照工作負載調整大小（例如 200 GiB）**，壓力全落在這顆硬碟上。也可以根據需求，額外使用 [Amazon EBS CSI Controller](https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html) 為容器加上獨佔的 EBS volume。

## 建立新的 Launch Template 版本

我使用 **Managed Node Group** 搭配 **Launch Template**，所以先新增一個版本，裡面定義兩顆硬碟：

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

這一份 **Userdata** 經過 base64 解碼後為以下腳本。其中的內容是將第二塊硬碟格式化，並且將掛載點設定寫入 fstab，再將 **containerd** 的內容複製回去。

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

**Managed Node Group** 套用了這個啟動模板後，節點會獲得兩個 EBS volume，並且第二塊硬碟掛載為 `/var/lib/containerd`，這個目錄是容器的檔案系統所在的位置。
## 建立 EKS 管理節點組（EKS managed node group）


```bash
LT_ID=$(aws ec2 describe-launch-templates --region eu-west-1 --query "LaunchTemplates[?LaunchTemplateName=='eks-node-with-optimized-storage'].LaunchTemplateId" --output text)

# 不指定 AMI 的情況，預設會使用的是 Amazon Linux 2023
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

**等待節點建立完成後**，我們可以登入節點當中確認掛載狀況：

```bash
sh-5.2$ lsblk
NAME          MAJ:MIN RM SIZE RO TYPE MOUNTPOINTS
nvme1n1       259:0    0  50G  0 disk /var/lib/containerd
nvme0n1       259:1    0  30G  0 disk
├─nvme0n1p1   259:2    0  30G  0 part /
├─nvme0n1p127 259:3    0   1M  0 part
└─nvme0n1p128 259:4    0  10M  0 part /boot/efi
```

**即使容器大量讀取寫入檔案系統**，也不會對 `nvme0n1` 造成壓力，因此也不會讓節點進入故障狀態，但在相同節點上的其他容器可能也會受到影響就是了。不過，至少我們仍能連入到系統當中，檢查問題。

## 建立測試容器驗證結果

我讓 **ChatGPT** 寫了一個 Pod，部署到 EKS cluster 當中，這個 Pod 做的事情就是使用工具對硬碟大量大量寫入：

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

最後，我們使用 **sar (system activity report)** 確認 disk 的壓力。可以看到負載目前全部都集中於 `nvme1n1`，也就是我們的第二塊硬碟。

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

## 收穫

**調整完之後**，節點在碰到容器的大量讀寫壓力時，也不會因為效能降級而導致節點進入故障狀態。我們也能根據不同的 application 特性，建立不同類型的節點，並且設定不同規格的 EBS 磁區，例如，在高 IO 的應用程式，就放在配備 io1 類型 EBS 磁區的節點上。
