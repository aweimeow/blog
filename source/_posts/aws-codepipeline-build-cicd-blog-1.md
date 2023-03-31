---
title: 以 AWS 及 GitHub 為部落格打造 CI/CD Pipeline - 1
date: 2020-04-08 15:15:00
categories: [系統維運]
tags: [aws, codepipeline, codebuild, webhosting]
thumbnail: https://i.imgur.com/WO6pkKv.png
---

故事是這樣子的，有了 CI/CD 的經驗之後，無意之間逛到 AWS CodePipeline 時，腦海中靈光一現，假設我在寫好新文章時，把文章的原始碼 commit 到 GitHub 的版本控制庫後，能夠自動更新到我的網站上的話就太方便了。

不僅如此 ... <!-- more -->如果可以用 AWS S3 做 Static Web Hosting 的話，我也不需要維護自己的 VPS 了對吧！

## 一不小心越弄越大

![AWS Services Chain for Blog CI/CD Architecture](https://i.imgur.com/WO6pkKv.png)

然而，這個簡單的假想就越搞越大，到後來為了讓網站服務完整一點，又 **搭配了 Route 53、CloudFront、Lambda 才達到我心中的效果** ，在實作過程當中，我們會需要具備一些關於 AWS 平臺的知識，例如說每一個服務的使用者（User）和角色（Role）都不同。這一些使用者、角色、政策都具備不一樣的權限，所以你也有可能需要到 **AWS Identity and Access Manager (IAM)** 更新權限。

這個系列文章觸及的服務很多，很難在單篇文章中講完，因此我將它分為三個部分來講述：**設定 CodePipeline**、**撰寫 CodeBuild 使用的 buildspec**、**設定 CloudFront 及 Lambda**，可能還會多出一個 **後記篇** 來記錄我對 Hexo 主題的修改，如果你已經準備好了，那我們就開始吧！

## CodePipeline 與 CodeBuild 的關係

![AWS CodePipeline 的組成](https://i.imgur.com/2yYqaTk.png)

首先，[CodeBuild](https://aws.amazon.com/tw/codebuild/) 是一套持續整合（Continous Integration）的服務，我們可以透過自定義的 script 來建置或測試程式。[CodePipeline](https://aws.amazon.com/tw/codepipeline/) 則是持續交付（Continous Delivery）的服務，我們能夠定義一個完整的 pipeline，來控制專案開發週期的每一個階段。

因此，我們會在 CodePipeline 當中設定幾個階段：
1. 來源（輸入到 pipeline 的程式碼）
2. 建置（呼叫 CodeBuild 來建置程式碼，也可以使用 Jenkins 來建置程式碼）
3. 測試（同上，可以指派給 CodeBuild 或 Jenkins 來做）
4. 部署

如果建立 pipeline 的目的只是要驗證程式功能性，那也不需要有部署階段。但我們的目的是透過整個 workflow 來產生部落格的靜態檔案並部署到 S3，所以我們只會有三個階段 **來源 > 建置 > 測試**。

## 建立 CodePipeline 與 CodeBuild

在此之前，你需要先建立兩個 S3 Bucket，一個作為建置時放置程式碼和建置 logs 用，另一個 bucket 的用途則是存放輸出檔案並建立靜態網站，建立 bucket 的過程不再贅述，應該可以找得到很多相關資源。至於這兩個 buckets 的名稱，我將它們命名為 `aweimeow-blog-build` 與 `aweimeow-blog-public`，讓接下來更容易辨識。

{% message color:success %}
為了使輸出結果可以被公開存取到，我們必須調整 `aweimeow-blog-public` 的公開存取設定，讓他們不會把新的 Access Policy 封鎖。

![作為靜態網站 Bucket 的公開存取設定](https://i.imgur.com/ty84J2H.png)

並且在它的 Access Policy 寫上以下內容：


{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::aweimeow-blog-public/*"
        }
    ]
}


這個規則會讓 bucket 當中的內容可以被所有人存取。
{% endmessage %}

### 建立一個 CodePipeline

在建立 pipeline 的第一步，我們需要設定 pipeline 的名稱、build 過程中檔案存放的地方，還有 Pipeline 所使用的角色。

![Pipeline Configuration Step 1](https://i.imgur.com/LbX5uZ1.png)

下一步，我們會新增 pipeline 要建置的來源，此時會需要授權給 AWS 存取 GitHub 的專案，我選擇使用 GitHub WebHook，只要專案有新的 commit 時，就會送一個請求給 AWS Pipeline，部落格也就會開始建置了。其實，AWS 還會幫我們 config 好 WebHook，如果回到 GitHub 的專案設定，你就會看到 WebHook 的 URL 已經被設定好了。

![GitHub WebHook Setting](https://i.imgur.com/Aadu3Y9.png)

### 建立一個 CodeBuild 專案

其實這裡可以選擇要使用 CodeBuild 或是 Jenkins，我選用的是 CodeBuild。

在建立專案的過程當中，可以參考 [Docker images provided by CodeBuild 一文](https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-available.html) 來找到關於要使用的 image 和 runtime，關於建置程式碼時使用到的 runtime 資訊，到時候會需要被填在 `buildspec.yml` 裡面。

在 CodeBuild 當中，還可以 **針對 Timeout、憑證、VPC、運算資源、環境變數去設定** ，但是因為 CodeBuild 的建立過程都很簡單，稍微困難的地方在於 **如何撰寫 BuildSpec**，而這個部分會在第二篇才講到。

### 設定 CodePipeline 的部署階段

在最後，我們要設定把成品部署到什麼地方，所以就直接選擇 Amazon S3，並選擇我們之前設定好的 bucket - `aweimeow-blog-public`，部署路徑可以不填寫，也可以填寫 Bucket 當中的特定路徑。

![設定部署的目的地](https://i.imgur.com/zM453dn.png)

到了這一個步驟，你的 Pipeline 已經建立好了，但因為現在還沒有透過 `buildspec.yml` 來定義行為，因此我們只能觀察到 Pipeline 把程式碼拉下來放到 `aweimeow-blog-build` Bucket，但卻不會執行任何動作。

## 設定 CodeBuild 的 bucket access 權限

![很開心的執行了 pipeline 居然噴錯了！](https://i.imgur.com/stLZO7c.png)

{% message color:success %}
原因是因為 `CLIENT_ERROR: AccessDenied: Access Denied status code: 403`，**我們並沒有賦予 CodeBuild 存取 S3 Bucket 的權限**。因此，我們需要到 IAM 當中修改 CodeBuild 的權限，因此點選服務選單：**IAM > 角色 > `codebuild-<ProjectName>`**，可以發現這個角色連結著一個政策（Policy）- `CodeBuildBasePolicy-<BuildName>-<region>`，而就是**它的 S3 Access Policy 沒有設定好**。

{% endmessage %}

![CodeBuild 預設被設定成只能操作 codepipeline 開頭的 Bucket 了](https://i.imgur.com/gMH8HnL.png)

因此，我們要修改這些規則，直接指定能修改的 Bucket 為 `aweimeow-blog-build` 裡面的任何資源，就像這樣：

![指定 Bucket 的 ARN 來給予 CodeBuild 操作權限](https://i.imgur.com/OhSfM7R.png)


<hr>

現在你的 Pipeline 已經可以啟動了，但是如果沒有寫 BuildSpec 的話，CodeBuild 還是不知道你的程式碼要怎麼被建置和測試，所以下篇會介紹怎麼寫 BuildSpec。

下一篇：[以 AWS 及 GitHub 為部落格打造 CI/CD Pipeline - 2 （CodeBuild BuildSpec 篇）](/aws-codepipeline-build-cicd-blog-2/)
