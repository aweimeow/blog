---
title: 以 AWS 及 GitHub 為部落格打造 CI/CD Pipeline - 2
date: 2020-04-09 15:15:00
categories: [系統維運]
tags: [aws, codebuild, buildspec, webhosting]
thumbnail: https://i.imgur.com/cfrCEZ1.png
---

到了現在，我們已經部署好我們的 AWS CodePipeline，如果你到放置建置檔案的 Bucket，應該可以看到 CodePipeline 從 GitHub 拉過來的程式碼，程式碼用 zip 的方式保存。在 pipeline 建立好之後，我們接下來要撰寫 Build spec，因為 CodeBuild 會根據 spec 的內容來依序執行由我們定義的建置步驟。

<!-- more -->

## 簡單理解 Build spec 的結構

BuildSpec 是一個描述建置程式步驟的檔案，就和 Jenkins Pipeline script 一樣，可以透過自定義的腳本程式碼來說明「我的程式應該要如何被建置和測試」。通常 `buildspec.yml` 檔案會被放在專案的根目錄，AWS CodeBuild 會去找到這一份檔案並執行內部定義的步驟。

```bash
# buildspec.yml 在專案目錄的相對位置
.
├── _config.yml
├── buildspec.yml
├── db.json
├── node_modules
├── package.json
├── scaffolds
├── source
└── themes
```

在 BuildSpec 當中有下列幾項讓 CodeBuild 知道如何建置程式碼的資訊：

1. **環境（env）**：定義環境變數，以及不會存放在專案內的 Credential Data
2. **建置階段（phase）**
    1. 安裝（install）
    2. 建置前準備（pre_build）
    3. 建置過程（build）
    4. 建置後指令（post_build）
3. **報告（reports）**：測試時產生的檔案應該被怎麼存放
4. **文件（artifacts）**：建置後產生的檔案應該被怎麼存放

在 BuildSpec 當中可以定義的參數非常多，當你不知道下一步應該要做什麼的時候，不妨到 [Buildspec reference](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) 找看看有沒有你需要的東西。

## Build spec 建置過程 - phases

一份 Build spec 當中至少需要具備 version, phases 兩個參數，也就是**至少必須定義這份 script 必須執行哪一些命令來完成管理者的要求（建置程式、測試程式）**，那麼我們就來看看一份基本的 spec 會長什麼樣子吧！

```yaml
# 這是一份殘缺的 buildspec，以下內容並不足以部署一個部落格
version: 0.2

phases:
build:
  commands:
    - hexo generate
artifacts:
  secondary-artifacts:
    artifact1:
      files:
        - public/*
      name: secondary-artifact-name-1
```

這一份建置腳本包含了一個階段 - 建置階段（build），同時也指定了 CodeBuild 需要把輸出的結果存放到某些地方（以便後續操作）。例如說，我們可以在這裡定義 `public` 資料夾是建置的結果輸出，並且我們需要把 `public` 資料夾中的檔案上傳到目的地。

### 定義執行的 4 個階段

我就直接拿我的 `buildspec.yml` 來作為範例討論了，但是為了方便閱讀，以下內容我有刪減掉部分程式碼，如此一來可以更專注在於理解 BuildSpec 應該要如何撰寫，如果需要完整版的程式碼，可以到 [GitHub: aweimeow/blog](https://github.com/aweimeow/blog) 閱讀。

```yaml
version: 0.2

env:
  variables:
    SUBMODULE_URL: "https://github.com/aweimeow/hexo-theme-icarus/archive/weiyu.dev.zip"

phases:
  install:
    commands:
      - echo Entered the install phase...
    runtime-versions:
      nodejs: 10
  pre_build:
    commands:
      - npm install hexo-cli -g
      - npm install hexo --save
  build:
    commands:
      - echo "Build started on `date`, triggered by $CODEBUILD_WEBHOOK_TRIGGER"
      - hexo generate
  post_build:
    commands:
      - echo "Build completed on `date`"

artifacts:
  secondary-artifacts:
    artifact1:
      files:
        - '**/'
      base-directory: public
      discard-paths: no
```

在上一個小節並沒有講到**「每一個階段該做什麼事？我該把我的指令放在哪一個階段？」**，雖然官方文件都有寫了，但是在這邊還是詳細講解一次：

* **安裝（install）**：如果有些 packages 必須被安裝在 build environment，就會在這個階段執行
    * 安裝程式語言的 package：NodeJs, Python, Go, ...
* **建置前準備（pre_build）**：安裝程式碼需要用到的相依套件庫
    * 例如說 npm dependency packages 就會在這裡安裝，或是 Python pip 指令
* **建置過程（build）**：建置的主要核心指令放在這裡，例如 make
* **建置後指令（post_build）**：在建置完成後可能需要打包執行檔，或是把製作好的 Image 推到 DockerHub

{% colorquote danger %}
需要特別提醒的是，如果你的專案使用了 Git submodule 的話，CodeBuild 不會幫忙把 submodule 的內容一起 clone 下來，所以我在 `pre_build` 階段額外下載了整個 submodule 並放到正確的目錄位置。

除此之外，因為我們有在 CodePipeline 設定好來源，所以 CodeBuild 很貼心的會幫我們把指令執行在「專案根目錄」當中，不需要把 `cd $PROJECT` 寫在 step 當中。
{% endcolorquote %}

## BuildSpec 的輸出檔案 - artifacts

在 artifacts 的部分，則是需要定義哪一些檔案是要被輸出到 CodePipeline 的，這邊不只是指定了路徑這麼簡單，他有很多種不同的輸出方式，也能根據需求只撿出部分檔案，還可以設定多個輸出的目的地。**很聰明的是 AWS CodeBuild 會把檔案壓縮成 zip（但也可以選擇解壓縮輸出），並且交付給 AWS Pipeline 去 Deploy，所以我們不需要額外設定，Pipeline 便能夠拿到輸出並把它們部署到 S3 當中了。**

在輸出檔案的過程中，我們也可以幫檔案取名字，例如比較常用的作法就是以建置日期來作為檔案輸出：

```yaml
version: 0.2
phases:
  build:
    commands:
      - make
artifacts:
  files:
    - '**/*'
  name: myproject-build-$(date +%Y-%m-%d)
```

除了使用 `$(date +%Y-%m-%d)` 來設定日期，其實也可以使用 [CodeBuild 提供的環境變數](https://docs.aws.amazon.com/codebuild/latest/userguide/build-env-ref-env-vars.html)，像是使用 `$CODEBUILD_SOURCE_VERSION` 就可以把建置的程式碼版本（GitHub commit ID）註記在檔案後方。

### artifacts 的路徑設定

{% colorquote info %}
但是，我們有時候只要某一個資料夾作為輸出，而且只需要以某些副檔名結尾的檔案，那要怎麼做？在官方文件裡面也舉出了一些例子給大家參考，假設我們的資料夾結構是這樣子的：

```
|-- my-build1
|     `-- my-file1.txt
`-- my-build2
      |-- my-file2.txt
      `-- my-subdirectory
            `-- my-file3.txt
```
{% endcolorquote %}

* **當我們的目標是取得所有的檔案，且希望可以把路徑都拿掉（所有檔案都被放在同一個 layer 的資料夾下）**

```yaml
artifacts:
  files:
    - '**/*'
  base-directory: 'my-build*'
  discard-paths: yes
```

這樣子就可以在符合 `/my-build*` 條件的資料夾底下，以遞迴的方式（`**/*`, lookup recursively），找到所有檔案並刪減掉路徑（discard-paths = yes），最後的結果就會像是：

```
|-- my-file1.txt
|-- my-file2.txt
`-- my-file3.txt
```

* **當我們的目標是取得特定資料夾下的所有檔案，同時想要保持資料夾的結構的話**

```yaml
artifacts:
  files:
    - '**/*'
  discard-paths: no
  base-directory: public
```

因為設定了 discard-paths 為 no，所以檔案前的路徑都不會被刪除。

<hr>

到了現在，想必已經大概瞭解如何去撰寫 buildspec 了，在下一個章節，我們會說明如何搭配 CloudFront 與 Lambda 服務，使自己的網站更完整。

下一篇：以 AWS 及 GitHub 為部落格打造 CI/CD Pipeline - 3 （CloudFront 與 Lambda 篇）
