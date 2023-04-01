---
title: 用 Free5GC 和 UERANSIM 建立一套 5G 行動網路環境
date: 2020-12-08 12:00:00
categories: [行動網路]
tags: [5g, free5gc, ueransim]
thumbnail: https://i.imgur.com/kCweWrn.png
---

這一篇文章會使用開源 5G 核心網路 [Free5GC](https://github.com/free5gc/free5gc) 及開源 5G 終端及基地臺模擬器 [UERANSIM](https://github.com/aligungr/UERANSIM) 建立一套完整的 5G 行動網路，建立完成後，我們也可以測試一下連網能力。

<!-- more -->

## 章節

1. [環境需求](#環境需求)
1. [升級 Kernel 版本](#升級-Kernel-版本)
2. [安裝編譯 Free5GC 所需的套件](#安裝編譯-Free5GC-所需的套件)
3. [編譯 Free5GC 與 UERANSIM](#編譯-Free5GC-與-UERANSIM)
5. [設定執行核心網路和執行模擬器](#設定執行核心網路和執行模擬器)

## 環境需求

Free5GC 官方建議採用 Ubuntu 18.04 作為實驗環境，其他 OS 不一定能編譯成功，也可能會碰到預期外的 bug。並且由於需要編譯 gtp5g kernel module，在下文有建議使用的核心版本。

## 升級 Kernel 版本

可以先用 `uname -r` 來確認核心的版本，核心版本需求為 `5.0.0-23` 或 `5.4 以上` 的版本，其他 distribution kernel 可能會沒辦法編譯 gtp5g kernel module。

```
sudo su -
apt-get install -qq \
        linux-image-5.0.0-23-generic \
        linux-modules-5.0.0-23-generic \
        linux-headers-5.0.0-23-generic \
        && grub-set-default 1 \
        && update-grub
```

grub 預設行為抓取最新版本的 kernel，所以如果是降級的話，記得把新版的 kernel 移除掉。然後以新安裝的 Kernel 重新開機。

## 安裝編譯 Free5GC 與 UERANSIM 所需的套件

接下來需要安裝編譯用的工具和 dependencies，以及 Go 語言。

```
sudo apt update

# Free5GC dependency packages
sudo apt install \
		git \
		build-essential \
		vim \
		strace \
		net-tools \
		iputils-ping \
		iproute2 \
        mongodb \
        wget \
        gcc \
        cmake \
        autoconf \
        libtool \
        pkg-config \
        libmnl-dev \
        libyaml-dev

# UERANSIM dependency packages
sudo apt install make g++ openjdk-11-jdk maven libsctp-dev lksctp-tools

wget https://dl.google.com/go/go1.14.4.linux-amd64.tar.gz
sudo tar -C /usr/local -zxvf go1.14.4.linux-amd64.tar.gz
mkdir -p ~/go/{bin,pkg,src}

echo 'export GOPATH=$HOME/go' >> ~/.bashrc
echo 'export GOROOT=/usr/local/go' >> ~/.bashrc
echo 'export PATH=$PATH:$GOPATH/bin:$GOROOT/bin' >> ~/.bashrc
source ~/.bashrc

# Check if Go installed with correct version
go version
```

安裝好之後，為了讓後續 UPF 能夠把封包 forward 出去，我們必須手動 config networking 和 iptables。

```
sudo sysctl -w net.ipv4.ip_forward=1
sudo iptables -t nat -A POSTROUTING -o {YOUR_DN_INTERFACE} -j MASQUERADE
sudo systemctl stop ufw
```

最後是編譯 gtp5g 的 Linux Kernel

```
git clone https://github.com/PrinzOwO/gtp5g.git
cd gtp5g
make clean
make
sudo make install
```

## 編譯 Free5GC 與 UERANSIM

```
# Compile Free5GC
git clone --recursive -b v3.0.4 -j $(nproc) https://github.com/free5gc/free5gc.git
cd ~/free5gc
make all
```

```
# Compile UERANSIM
git clone https://github.com/aligungr/UERANSIM.git
cd ~/UERANSIM
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64/
./build.sh
```

## 設定執行核心網路和執行模擬器

1. 啟動 Free5GC 核心網路與 WebUI

    ```
    # Use 2 terminals to run separate commands
    # Free5GC core networks
    ./run.sh

    # Free5GC web console, access the WebUI by localhost:5000
    cd webconsole
    go run server
    ```

2. 修改 UERANSIM 的 `config/profile.yaml` 中選擇的 profile 為 `free5gc`

    ```
    # Default possible profiles are:
    #  - custom
    #  - open5gs
    #  - free5gc
    #  - havelsan
    # You can also create unlimited number of custom profiles by creating a folder for them.
    selected-profile: 'free5gc'
    ```

3. 連入 Free5GC 的頁面新增一個 subscriber，認證模式選擇 `OP`，UERANSIM 目前預設使用這種模式。

    ![](https://i.imgur.com/bYut5xT.png)

4. 啟動 UERANSIM 並選擇 `pdu-session-establishment`

    ![](https://i.imgur.com/HaXNS7j.png)

    當看到 "Ping reply from google.com" 就是成功 ping 通了。

實驗環境要搭建其實很簡單，在 UERANSIM 也有教學怎麼操作 interface 並透過這個 interface 來上網，你也可以透過 tcpdump 或 wireshark 來觀察到 GTP-U 的 tunnel packets。
